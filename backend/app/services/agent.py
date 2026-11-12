"""The tool-using agent loop (hand-written; no LangChain, so every stream event is ours).

`run_agent` streams one model call after another: whenever the model asks for tools they are
executed and their outputs are fed back, until the model answers without calling a tool or
`AGENT_MAX_STEPS` is reached (the last step runs with `tool_choice="none"` so a final answer is
always produced). It yields typed events; `services/chat.py` turns them into SSE frames,
persisted `parts` and metrics.

The conversation is replayed statelessly (`store=False`): each step sends the history, the user
message, and every output item and tool result so far, including encrypted reasoning items.
"""

import json
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings
from app.prompts import SELECTION_NOTE, SYSTEM_PROMPT
from app.services import llm
from app.services.tools import TOOL_DEFINITIONS, ToolContext, run_tool, timed_ms
from app.services.usage import Usage, usage_from_response

log = logging.getLogger("docgenie.agent")


@dataclass
class ReasoningDelta:
    text: str


@dataclass
class ToolStart:
    call_id: str
    name: str
    args: dict[str, Any]


@dataclass
class ToolEnd:
    call_id: str
    name: str
    summary: str
    duration_ms: int
    ok: bool


@dataclass
class TextDelta:
    text: str


@dataclass
class AgentStats:
    """Totals for a run. The caller owns it and `run_agent` updates it as it goes, so usage and
    timing are still available when the run fails or the client disconnects mid-way."""

    usage: Usage = field(default_factory=Usage)
    steps: int = 0
    llm_seconds: float = 0.0  # time waiting on / streaming the model (tool time excluded)
    tool_calls: int = 0
    service_tier: str = ""
    flex_fallback: bool = False


AgentEvent = ReasoningDelta | ToolStart | ToolEnd | TextDelta


def build_instructions(ctx: ToolContext) -> str:
    return SYSTEM_PROMPT + (SELECTION_NOTE if ctx.document_ids else "")


def _parse_args(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw and raw.strip() else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


async def run_agent(
    *, ctx: ToolContext, history: list[dict[str, Any]], user_text: str, stats: AgentStats
) -> AsyncIterator[AgentEvent]:
    """Run the loop. Raises `llm.LlmError` if the model call fails."""
    s = get_settings()
    instructions = build_instructions(ctx)
    items: list[dict[str, Any]] = [*history, {"role": "user", "content": user_text}]
    info = llm.StreamInfo()

    for step in range(s.agent_max_steps):
        stats.steps = step + 1
        forced_answer = step == s.agent_max_steps - 1
        started = time.perf_counter()
        completed: Any = None
        saw_summary_part = False
        async for event in llm.stream_response(
            input_items=items,
            instructions=instructions,
            tools=TOOL_DEFINITIONS,
            tool_choice="none" if forced_answer else "auto",
            info=info,
        ):
            kind = event.type
            stats.service_tier = info.service_tier  # the tier actually serving this run
            stats.flex_fallback = info.flex_fallback
            if kind == "response.reasoning_summary_text.delta":
                yield ReasoningDelta(event.delta)
            elif kind == "response.reasoning_summary_part.added":
                if saw_summary_part:
                    yield ReasoningDelta("\n\n")  # keep separate summary sections apart
                saw_summary_part = True
            elif kind == "response.output_text.delta":
                yield TextDelta(event.delta)
            elif kind in ("response.completed", "response.incomplete"):
                completed = event.response
            elif kind in ("response.failed", "error"):
                log.warning("model stream reported %s: %r", kind, event)
                raise llm.LlmError(llm.LLM_ERROR, "The model could not complete the request.")
        stats.llm_seconds += time.perf_counter() - started
        stats.flex_fallback = info.flex_fallback
        if completed is None:
            raise llm.LlmError(llm.LLM_ERROR, "The model stream ended unexpectedly.")

        stats.usage.add(usage_from_response(completed))
        info.service_tier = getattr(completed, "service_tier", None) or info.service_tier
        stats.service_tier = info.service_tier
        output = list(completed.output or [])
        calls = [o for o in output if o.type == "function_call"]
        if not calls:
            break

        items.extend(o.model_dump(exclude_none=True) for o in output)
        for call in calls:
            stats.tool_calls += 1
            args = _parse_args(call.arguments)
            yield ToolStart(call.call_id, call.name, args)
            t0 = time.perf_counter()
            result = await run_tool(call.name, call.arguments, ctx)
            duration = timed_ms(t0)
            yield ToolEnd(call.call_id, call.name, result.summary, duration, result.ok)
            items.append(
                {"type": "function_call_output", "call_id": call.call_id, "output": result.output}
            )


@dataclass
class Accumulator:
    """Collects an agent run into the ordered `parts` list stored with the message."""

    parts: list[dict[str, Any]] = field(default_factory=list)

    def reasoning(self, text: str) -> None:
        if self.parts and self.parts[-1]["type"] == "reasoning":
            self.parts[-1]["text"] += text
        else:
            self.parts.append({"type": "reasoning", "text": text})

    def text(self, text: str) -> None:
        if self.parts and self.parts[-1]["type"] == "text":
            self.parts[-1]["text"] += text
        else:
            self.parts.append({"type": "text", "text": text})

    def tool_start(self, ev: ToolStart) -> None:
        self.parts.append(
            {
                "type": "tool",
                "id": ev.call_id,
                "name": ev.name,
                "args": ev.args,
                "status": "running",
            }
        )

    def tool_end(self, ev: ToolEnd) -> None:
        for part in reversed(self.parts):
            if part["type"] == "tool" and part["id"] == ev.call_id:
                part.update(
                    status="done" if ev.ok else "error",
                    result_summary=ev.summary,
                    duration_ms=ev.duration_ms,
                )
                return

    @property
    def content(self) -> str:
        return "".join(p["text"] for p in self.parts if p["type"] == "text")
