"""Extract page-tagged text from PDF, DOCX, and PPTX uploads.
Scanned PDFs fall back to local Tesseract OCR (CPU, no LLM)."""

from __future__ import annotations

import io
from collections import Counter

from fastapi import HTTPException

from app.services.pdf import (
    MIN_TEXT_CHARS,
    _join_hyphenated,
    _normalize_whitespace,
)

PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK"  # zip
MAX_OCR_PAGES = 30  # CPU OCR cost grows per page; cap the work per upload


def _ext(filename: str) -> str:
    name = (filename or "").rsplit(".", 1)
    return name[-1].lower() if len(name) == 2 else ""


def detect_kind(filename: str, data: bytes) -> str:
    ext = _ext(filename)
    if data.startswith(PDF_MAGIC) or ext == "pdf":
        return "pdf"
    if ext in ("docx",) and data[:2] == DOCX_MAGIC:
        return "docx"
    if ext in ("pptx",) and data[:2] == DOCX_MAGIC:
        return "pptx"
    if ext in ("ppt",):
        raise HTTPException(
            status_code=400,
            detail="Legacy .ppt is not supported. Save as .pptx or PDF and upload again.",
        )
    raise HTTPException(
        status_code=400,
        detail="Supported uploads: PDF, DOCX, and PPTX.",
    )


def extract_docx_pages(data: bytes) -> list[dict]:
    try:
        from docx import Document
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="DOCX support is not installed.") from exc
    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read this Word document.") from exc
    paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
            if cells:
                paras.append(" | ".join(cells))
    text = _normalize_whitespace("\n".join(paras))
    if len(text) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail="This Word document has almost no readable text.",
        )
    return [{"page": 1, "text": text}]


def extract_pptx_pages(data: bytes) -> list[dict]:
    try:
        from pptx import Presentation
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="PPTX support is not installed.") from exc
    try:
        prs = Presentation(io.BytesIO(data))
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail="Could not read this PowerPoint file."
        ) from exc
    pages: list[dict] = []
    for i, slide in enumerate(prs.slides, start=1):
        bits: list[str] = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text and shape.text.strip():
                bits.append(shape.text.strip())
        text = _normalize_whitespace("\n".join(bits))
        if text:
            pages.append({"page": i, "text": text})
    total = sum(len(p["text"]) for p in pages)
    if total < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail="This presentation has almost no readable text. Export slides as PDF and try again.",
        )
    return pages


def extract_pdf_text_pages(data: bytes) -> list[dict]:
    """Text-layer PDF extraction (no OCR). May return sparse pages for scans."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        raw_pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read this PDF file.") from exc

    n_pages = len(raw_pages)
    line_counts: Counter[str] = Counter()
    page_lines = []
    for text in raw_pages:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        page_lines.append(lines)
        for line in set(lines):
            line_counts[line] += 1

    threshold = n_pages / 2
    repeated = {line for line, count in line_counts.items() if n_pages > 1 and count > threshold}

    pages = []
    for i, lines in enumerate(page_lines):
        kept = [line for line in lines if line not in repeated]
        text = _join_hyphenated("\n".join(kept))
        text = _normalize_whitespace(text)
        pages.append({"page": i + 1, "text": text})
    return pages


async def ocr_pdf_pages(data: bytes) -> list[dict]:
    """Read scanned PDF pages locally with Tesseract (no LLM, no network)."""
    from fastapi.concurrency import run_in_threadpool

    from app.services import ocr_service

    if not ocr_service.tesseract_available():
        raise HTTPException(
            status_code=400,
            detail={
                "detail": (
                    "This PDF looks like scanned images and the server's OCR engine "
                    "(Tesseract) is not installed. Paste the text instead."
                ),
                "code": "SCANNED_PDF",
            },
        )
    raw = await run_in_threadpool(ocr_service.ocr_pdf_pages, data, max_pages=MAX_OCR_PAGES)
    pages = [{"page": p["page"], "text": _normalize_whitespace(p["text"])} for p in raw]
    total = sum(len(p["text"]) for p in pages)
    if total < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail={
                "detail": "OCR could not read enough text from this PDF. Try a clearer scan or paste notes.",
                "code": "SCANNED_PDF",
            },
        )
    return pages


async def extract_pages(filename: str, data: bytes) -> tuple[str, list[dict]]:
    """Return (kind, pages) for an uploaded file. Runs OCR for scanned PDFs."""
    kind = detect_kind(filename, data)
    if kind == "docx":
        return kind, extract_docx_pages(data)
    if kind == "pptx":
        return kind, extract_pptx_pages(data)

    pages = extract_pdf_text_pages(data)
    total = sum(len(p["text"]) for p in pages)
    if total >= MIN_TEXT_CHARS:
        return "pdf", pages
    # Scanned / image PDF → OCR
    ocr_pages = await ocr_pdf_pages(data)
    return "pdf", ocr_pages
