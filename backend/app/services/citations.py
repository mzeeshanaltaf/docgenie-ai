"""Point a citation at the passage the answer actually relied on.

A search hit is a whole chunk (about CHUNK_SIZE characters, sometimes spanning two pages) and a
`get_document_text` source is a whole document, so the start of the source is rarely the
sentence the answer used. Once the answer is complete, the sentences that cite `[n]` are compared
word by word with the sentences and lines of source n, and the best-matching span becomes the
citation snippet, which the viewer finds and highlights. For a full-text source the page range
is also narrowed to the `[Page N]` section that holds the span.

Lexical overlap is enough here: the answer quotes or closely paraphrases its evidence, the search
space is a single source, and it costs no model call. When the answer shares too little with the
source, `focus_source` returns None and the citation keeps the source's opening.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

CITATION_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")

_WORD_RE = re.compile(r"[^\W_]+")
_DIGIT_GROUP_RE = re.compile(r"(?<=\d)[,  '](?=\d{3}(?!\d))")  # 4,200 -> 4200
_SOURCE_SPLIT_RE = re.compile(r"(?<=[.!?;])\s+|\n+")  # sentences, and lines (PDF text wraps)
_CLAIM_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_PAGE_MARKER_RE = re.compile(r"^\[Page (\d+)\]$", re.MULTILINE)

_STOPWORDS = frozenset(
    [
        "the",
        "and",
        "for",
        "are",
        "was",
        "were",
        "been",
        "being",
        "this",
        "that",
        "these",
        "those",
        "its",
        "which",
        "who",
        "whom",
        "what",
        "when",
        "where",
        "how",
        "than",
        "then",
        "there",
        "their",
        "they",
        "them",
        "his",
        "her",
        "she",
        "our",
        "you",
        "your",
        "not",
        "but",
        "such",
        "into",
        "over",
        "under",
        "about",
        "after",
        "before",
        "between",
        "per",
        "also",
        "any",
        "all",
        "each",
        "other",
        "may",
        "can",
        "will",
        "shall",
        "would",
        "should",
        "could",
        "has",
        "have",
        "had",
        "does",
        "did",
        "with",
        "from",
        "upon",
        "only",
        "more",
        "most",
        "some",
        "very",
        "just",
        "own",
        "same",
        "both",
        "here",
        "out",
    ]
)

MAX_SEGMENT_CHARS = 300  # a longer sentence or line is cut at word boundaries
MIN_CLAIM_TOKENS = 4  # a shorter claim borrows the sentence before it
MIN_MATCH = 2.0  # roughly two shared words; below that the match is a coincidence
LENGTH_COST = 0.004  # per character, so a window only grows when it adds shared words


@dataclass(frozen=True)
class Focus:
    snippet: str
    # Pages holding the passage, when the source knows them more precisely than its own range
    # (full-text sources). None keeps the source's range.
    page_start: int | None = None
    page_end: int | None = None


@dataclass(frozen=True)
class _Segment:
    start: int
    end: int
    page: int | None
    page_end: int | None
    tokens: frozenset[str]


def cited_numbers(group: str) -> set[int]:
    """The numbers in one marker's inner text: "1" or "1, 3"."""
    return {int(n) for n in re.split(r"\s*,\s*", group)}


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    for suffix in ("ing", "ed", "s"):
        if len(word) - len(suffix) >= 3 and word.endswith(suffix):
            word = word[: -len(suffix)]
            break
    return word[:-1] if len(word) > 3 and word.endswith("e") else word


def tokens(text: str) -> list[str]:
    """Content words, lightly stemmed, plus every token that contains a digit."""
    out: list[str] = []
    for word in _WORD_RE.findall(_DIGIT_GROUP_RE.sub("", text.lower())):
        if any(c.isdigit() for c in word):
            out.append(word)
        elif len(word) > 2 and word not in _STOPWORDS:
            out.append(_stem(word))
    return out


def claim_text(answer: str, index: int) -> str:
    """The answer text each `[index]` marker backs: the sentence (or line) just before it."""
    claims: list[str] = []
    for m in CITATION_RE.finditer(answer):
        if index not in cited_numbers(m.group(1)):
            continue
        head = CITATION_RE.sub(" ", answer[max(0, m.start() - 800) : m.start()]).rstrip()
        pieces = [p for p in _CLAIM_SPLIT_RE.split(head) if p.strip()]
        claim: list[str] = []
        while pieces and len(tokens(" ".join(claim))) < MIN_CLAIM_TOKENS:
            claim.insert(0, pieces.pop())
        if claim:
            claims.append(" ".join(claim))
    return "\n".join(claims)


def _sections(text: str, paged: bool) -> list[tuple[int, int, int | None, int | None]]:
    """(start, end, page, last page) per `[Page N]` section; one page-less section otherwise."""
    markers = list(_PAGE_MARKER_RE.finditer(text)) if paged else []
    if not markers:
        return [(0, len(text), None, None)]
    out: list[tuple[int, int, int | None, int | None]] = []
    if markers[0].start() > 0:
        out.append((0, markers[0].start(), None, None))
    for i, m in enumerate(markers):
        page = int(m.group(1))
        nxt = markers[i + 1] if i + 1 < len(markers) else None
        # Page markers come from each chunk's first page, so a section can run onto the page
        # where the next section starts.
        last = max(page, int(nxt.group(1))) if nxt else None
        out.append((m.end(), nxt.start() if nxt else len(text), page, last))
    return out


def _segments(text: str, paged: bool) -> list[_Segment]:
    segments: list[_Segment] = []
    for sec_start, sec_end, page, page_end in _sections(text, paged):
        pos = sec_start
        bounds: list[tuple[int, int]] = []
        for m in _SOURCE_SPLIT_RE.finditer(text, sec_start, sec_end):
            bounds.append((pos, m.start()))
            pos = m.end()
        bounds.append((pos, sec_end))
        for start, end in bounds:
            while start < end and text[start].isspace():
                start += 1
            while end > start and text[end - 1].isspace():
                end -= 1
            while end - start > MAX_SEGMENT_CHARS:
                cut = text.rfind(" ", start, start + MAX_SEGMENT_CHARS)
                cut = cut if cut > start else start + MAX_SEGMENT_CHARS
                segments.append(
                    _Segment(start, cut, page, page_end, frozenset(tokens(text[start:cut])))
                )
                start = cut
                while start < end and text[start].isspace():
                    start += 1
            if end > start:
                segments.append(
                    _Segment(start, end, page, page_end, frozenset(tokens(text[start:end])))
                )
    return segments


def focus_source(
    text: str, claim: str, *, paged: bool = False, max_chars: int = 360
) -> Focus | None:
    """The span of `text` that best supports `claim`, or None when nothing matches well enough.

    Spans are one or more consecutive segments (sentences or lines) inside one page section, at
    most `max_chars` long. A span scores the summed weight of the claim words it contains, where
    a word that occurs in fewer segments weighs more and numbers weigh double, minus a small cost
    per character so that a span only grows when it gains evidence.
    """
    want = set(tokens(claim))
    if not want or not text.strip():
        return None
    segments = _segments(text, paged)
    if not segments:
        return None
    df = Counter(t for s in segments for t in s.tokens & want)
    n = len(segments)
    weight = {
        t: (2.0 if any(c.isdigit() for c in t) else 1.0) * (1.0 + math.log(n / count))
        for t, count in df.items()
    }

    best: tuple[float, float, int, int] | None = None  # (score, matched weight, first, last)
    for i, first in enumerate(segments):
        seen: set[str] = set()
        for j in range(i, n):
            seg = segments[j]
            if seg.page != first.page or (j > i and seg.end - first.start > max_chars):
                break
            seen |= seg.tokens & want
            matched = sum(weight[t] for t in seen)
            score = matched - LENGTH_COST * (seg.end - first.start)
            if best is None or score > best[0]:
                best = (score, matched, i, j)
    if best is None or best[1] < MIN_MATCH:
        return None
    first, last = segments[best[2]], segments[best[3]]
    snippet = " ".join(text[first.start : last.end].split())
    return Focus(snippet, first.page, first.page_end if first.page is not None else None)
