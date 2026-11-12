"""A scripted stand-in for the OpenAI Responses API (streaming and one-shot).

Queue steps with `fake.script(...)`; each `responses.create(stream=True)` call consumes one step.
A step can stream reasoning summary text, answer text and function calls, mirroring the event
names the real SDK emits (verified against the live API in the Phase 3 probe).
"""

import json
import types
from dataclasses import dataclass, field
from typing import Any, Self


class Item(types.SimpleNamespace):
    def model_dump(self, **_: Any) -> dict[str, Any]:
        return dict(vars(self))


def _ev(type_: str, **kw: Any) -> types.SimpleNamespace:
    return types.SimpleNamespace(type=type_, **kw)


def _usage(inp: int, out: int, reasoning: int) -> types.SimpleNamespace:
    return types.SimpleNamespace(
        input_tokens=inp,
        output_tokens=out,
        output_tokens_details=types.SimpleNamespace(reasoning_tokens=reasoning),
        input_tokens_details=types.SimpleNamespace(cached_tokens=0),
    )


@dataclass
class Step:
    reasoning: list[str] = field(default_factory=list)  # one entry per summary part
    text: list[str] = field(default_factory=list)  # answer deltas
    tool_calls: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    input_tokens: int = 100
    output_tokens: int = 40
    reasoning_tokens: int = 10
    fail_on_create: Exception | None = None
    fail_mid_stream: Exception | None = None  # raised after the first text delta
    fail_at_stream_start: Exception | None = None  # raised inside the open stream, before content
    hang_after_first_text: bool = False  # block forever once the first text delta is out


class FakeStream:
    def __init__(self, step: Step, call_index: int) -> None:
        self.step = step
        self.call_index = call_index
        self.closed = False

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        self.closed = True

    def __aiter__(self):
        return self._events()

    async def _events(self):
        import asyncio

        st = self.step
        yield _ev("response.created")
        if st.fail_at_stream_start is not None:
            raise st.fail_at_stream_start
        for part in st.reasoning:
            yield _ev("response.reasoning_summary_part.added")
            for word in part.split(" "):
                yield _ev("response.reasoning_summary_text.delta", delta=word + " ")
        output: list[Item] = []
        for i, (name, args) in enumerate(st.tool_calls):
            output.append(
                Item(
                    type="function_call",
                    call_id=f"call_{self.call_index}_{i}",
                    name=name,
                    arguments=json.dumps(args),
                )
            )
        for n, chunk in enumerate(st.text):
            yield _ev("response.output_text.delta", delta=chunk)
            if n == 0 and st.fail_mid_stream is not None:
                raise st.fail_mid_stream
            if n == 0 and st.hang_after_first_text:
                await asyncio.sleep(3600)
        if st.text:
            output.append(Item(type="message", role="assistant", content="".join(st.text)))
        yield _ev(
            "response.completed",
            response=types.SimpleNamespace(
                usage=_usage(st.input_tokens, st.output_tokens, st.reasoning_tokens),
                service_tier="default",
                output=output,
            ),
        )


class ScriptedResponses:
    def __init__(self) -> None:
        self.steps: list[Step] = []
        self.calls: list[dict[str, Any]] = []  # the params of every create() call
        self.streams: list[FakeStream] = []
        self.title = "A Fake Title"
        self.fail_title = False

    def script(self, *steps: Step) -> None:
        self.steps.extend(steps)

    async def create(self, **params: Any) -> Any:
        self.calls.append(params)
        if not params.get("stream"):  # titles
            if self.fail_title:
                raise RuntimeError("title model down")
            return types.SimpleNamespace(
                output_text=self.title, usage=_usage(30, 5, 0), service_tier="default"
            )
        if not self.steps:
            raise AssertionError("the agent made more model calls than the test scripted")
        step = self.steps.pop(0)
        if step.fail_on_create is not None:
            raise step.fail_on_create
        stream = FakeStream(step, len(self.streams))
        self.streams.append(stream)
        return stream
