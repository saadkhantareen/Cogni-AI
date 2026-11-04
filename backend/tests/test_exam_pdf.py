"""Unit tests for formal exam PDF layout (no Mongo)."""

from __future__ import annotations

import pymupdf

from app.services.exam_pdf import build_exam_pdf


def _text(pdf: bytes) -> str:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


def _hline_count(pdf: bytes) -> int:
    """Count near-horizontal drawn segments (header rules + any answer blanks)."""
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    try:
        n = 0
        for page in doc:
            for drawing in page.get_drawings():
                for item in drawing.get("items", []):
                    if item[0] != "l":
                        continue
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) < 0.5 and abs(p1.x - p2.x) > 40:
                        n += 1
        return n
    finally:
        doc.close()


def test_formal_pdf_sections_no_answer_blanks():
    exam = {
        "title": "Biochemistry Midterm",
        "kind": "Midterm",
        "duration_min": 60,
        "questions": [
            {
                "qid": "1",
                "type": "MCQ",
                "text": "Which element forms the backbone of organic molecules?",
                "marks": 1,
                "options": ["Carbon", "Nitrogen", "Sulfur", "Phosphorus"],
                "correct": "Carbon",
            },
            {
                "qid": "2",
                "type": "Short",
                "text": "Define biochemistry.",
                "marks": 2.5,
                "model_answer": "SECRET_SHORT",
            },
            {
                "qid": "3",
                "type": "Essay",
                "text": "Compare DNA and RNA.",
                "marks": 9,
                "model_answer": "SECRET_ESSAY",
            },
        ],
    }
    pdf, filename = build_exam_pdf(
        exam, class_code="BCH-001", class_name="Biochemistry"
    )
    assert filename.endswith(".pdf")
    text = _text(pdf)
    assert "BIOCHEMISTRY MIDTERM EXAMINATION" in text
    assert "Course Code: BCH-001" in text
    assert "Section A - Multiple-Choice Questions" in text
    assert "Section B - Short-Answer Questions" in text
    assert "Section C - Long-Answer Questions" in text
    assert "Define biochemistry." in text
    assert "Compare DNA and RNA." in text
    assert "End of Examination" in text
    assert "SECRET_SHORT" not in text
    assert "SECRET_ESSAY" not in text
    # Identity header rule(s) only — not 3 answer underlines per written question.
    assert _hline_count(pdf) <= 3
