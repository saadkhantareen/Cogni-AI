"""Readable PDF of extracted course text when the original is not a PDF."""

from __future__ import annotations

import re

import pymupdf

PAGE_WIDTH = 595
PAGE_HEIGHT = 842
MARGIN = 54
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
MAX_CHARS = 180_000


def preview_filename(name: str) -> str:
    base = name or "material"
    base = re.sub(r"\.(pdf|docx|pptx|txt)$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"[^\w\s\-]+", "", base, flags=re.UNICODE).strip()
    base = re.sub(r"\s+", "-", base) or "material"
    return f"{base[:80]}.pdf"


def build_material_preview_pdf(name: str, text: str) -> bytes:
    body = (text or "").replace("\r\n", "\n").strip()
    if len(body) > MAX_CHARS:
        body = body[:MAX_CHARS].rsplit(" ", 1)[0] + "\n\n[Preview truncated.]"
    if not body:
        body = "This material has no extracted text to preview."

    doc = pymupdf.open()
    page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
    y = float(MARGIN)
    page, y = _write(doc, page, y, name or "Course material", size=16, bold=True)
    y += 8
    page, y = _write(doc, page, y, "Extracted text preview", size=10)
    y += 14
    for para in body.split("\n"):
        page, y = _write(doc, page, y, para if para.strip() else " ")
        y += 4
    out = doc.tobytes()
    doc.close()
    return out


def _write(doc, page, y, text, *, size=11, bold=False):
    font = "hebo" if bold else "helv"
    words = (text or " ").split()
    if not words:
        words = [" "]
    line = ""
    while words or line:
        if words:
            trial = f"{line} {words[0]}".strip() if line else words[0]
            if pymupdf.get_text_length(trial, fontname=font, fontsize=size) <= CONTENT_WIDTH:
                line = trial
                words.pop(0)
                continue
        if not line and words:
            token = words.pop(0)
            cut = len(token)
            while cut > 1 and pymupdf.get_text_length(token[:cut], fontname=font, fontsize=size) > CONTENT_WIDTH:
                cut -= 1
            line = token[:cut]
            if cut < len(token):
                words.insert(0, token[cut:])
        if y + size + 8 > PAGE_HEIGHT - MARGIN:
            page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
            y = float(MARGIN)
        page.insert_text((MARGIN, y + size), line, fontsize=size, fontname=font)
        y += size + 4
        line = ""
    return page, y
