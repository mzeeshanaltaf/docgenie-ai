"""Narrowing a citation to the passage the answer used (pure functions, no infrastructure)."""

from app.services.citations import claim_text, focus_source, tokens
from app.services.tools import merge_chunks, render_with_page_markers

CHUNK = (
    "SERVICES AGREEMENT\n"
    "1. Payment. The client shall pay each invoice within 30 days of receipt.\n"
    "2. Confidentiality. Each party keeps the other party's information secret for five years "
    "after termination.\n"
    "3. Governing law. This agreement is governed by the laws of Ireland and the courts of "
    "Dublin have exclusive jurisdiction.\n"
    "4. Notices. Notices must be sent by registered post."
)


def test_claim_is_the_sentence_before_the_marker():
    answer = "Invoices are due in 30 days [1]. The agreement is governed by Irish law [2][1]."
    assert claim_text(answer, 2) == "The agreement is governed by Irish law"
    assert "30 days" in claim_text(answer, 1) and "Irish law" in claim_text(answer, 1)


def test_marker_after_the_full_stop_and_short_claims_borrow_the_previous_sentence():
    assert claim_text("The courts of Dublin decide disputes. [3]", 3).startswith(
        "The courts of Dublin"
    )
    short = claim_text("Ireland's courts have exclusive jurisdiction. That is Dublin [1].", 1)
    assert "exclusive jurisdiction" in short and "Dublin" in short


def test_claim_on_a_markdown_list_line():
    answer = "Key terms:\n- **Payment:** within 30 days of receipt [1]\n- **Law:** Ireland [2]"
    assert claim_text(answer, 1) == "- **Payment:** within 30 days of receipt"


def test_focus_picks_the_matching_sentence_not_the_start():
    focus = focus_source(CHUNK, "The agreement is governed by the laws of Ireland")
    assert focus is not None
    assert focus.snippet.startswith("This agreement is governed by the laws of Ireland")
    assert "SERVICES AGREEMENT" not in focus.snippet and focus.page_start is None


def test_numbers_count_and_digit_groups_are_normalised():
    focus = focus_source(
        "Revenue was 3,900 in 2023.\nRevenue was 4,200 in 2024.", "Revenue reached 4200 in 2024"
    )
    assert focus is not None and focus.snippet == "Revenue was 4,200 in 2024."


def test_no_real_overlap_gives_no_focus():
    assert focus_source(CHUNK, "The weather was sunny") is None
    assert focus_source(CHUNK, "") is None
    assert focus_source("", "governed by Ireland") is None


def test_full_text_focus_narrows_the_page_range():
    text, pages = merge_chunks(
        [
            ("Introduction to the annual report and the company's strategy.", 1),
            ("The board approved a dividend of 12 cents per share in March.", 2),
            ("Risks include currency exposure and supplier concentration.", 4),
        ]
    )
    shown = render_with_page_markers(text, pages)
    focus = focus_source(shown, "The board approved a 12 cent dividend", paged=True)
    assert focus is not None and "dividend of 12 cents" in focus.snippet
    assert "[Page" not in focus.snippet
    assert (focus.page_start, focus.page_end) == (2, 4)  # section 2 may run onto page 4


def test_a_span_never_crosses_a_page_marker():
    shown = "[Page 1]\nThe dividend policy is reviewed yearly.\n\n[Page 2]\nThe board approved a dividend."
    focus = focus_source(
        shown, "The board reviewed and approved the dividend policy yearly", paged=True
    )
    assert focus is not None and "[Page" not in focus.snippet


def test_long_unpunctuated_text_is_cut_into_segments():
    filler = " ".join(f"word{i}" for i in range(200))
    focus = focus_source(
        f"{filler} the termination notice period is thirty days {filler}",
        "notice period thirty days",
    )
    assert focus is not None and "thirty days" in focus.snippet and len(focus.snippet) <= 360


def test_tokens_drop_stopwords_and_stem():
    assert tokens("The Notices were governed by laws") == ["notic", "govern", "law"]
    assert tokens("policies and the policy") == ["policy", "policy"]
