"""Unit tests for the teacher material preview PDF (no Mongo)."""

from __future__ import annotations

import pymupdf

from app.services.material_preview import build_material_preview_pdf, preview_filename


def _text(pdf: bytes) -> str:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


def test_preview_pdf_contains_title_and_body():
    pdf = build_material_preview_pdf(
        "Week 3 notes",
        "Binding energy is the energy needed to split a nucleus.",
    )
    assert pdf.startswith(b"%PDF")
    text = _text(pdf)
    assert "Week 3 notes" in text
    assert "Binding energy is the energy needed to split a nucleus." in text


def test_empty_text_still_opens():
    pdf = build_material_preview_pdf("Empty", "")
    assert "no extracted text" in _text(pdf)


def test_long_text_spans_more_than_one_page():
    pdf = build_material_preview_pdf("Long", "word " * 4000)
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    try:
        assert doc.page_count > 1
    finally:
        doc.close()


def test_preview_filename():
    assert preview_filename("Lecture 1: Forces.pdf") == "Lecture-1-Forces.pdf"
