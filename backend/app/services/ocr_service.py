"""CPU-only OCR / text extraction (Tesseract + PyMuPDF + python-pptx).

Ported from reference/extract_text.py into a structured service for /api/ocr.
Never logs file contents; callers must use temp files only.
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

ALLOWED_EXTENSIONS = frozenset(
    {".pdf", ".pptx", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
)
MAX_OCR_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_PDF_PAGES = 50  # 300-dpi OCR is slow on CPU; cap the work per request
MAX_REDIRECTS = 5
FETCH_TIMEOUT_SEC = 30
DOC_HINT = (
    "Old .doc files are not read directly. Convert first with LibreOffice:\n"
    "  soffice --headless --convert-to docx yourfile.doc\n"
    "then upload the .docx file."
)
PPT_HINT = (
    "Old .ppt files are not read directly. Convert first with LibreOffice:\n"
    "  soffice --headless --convert-to pptx yourfile.ppt\n"
    "then upload the .pptx file."
)

_tesseract_ready = False


def _configure_tesseract() -> None:
    import pytesseract

    cmd = os.environ.get("TESSERACT_CMD", "").strip()
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd


def tesseract_available() -> bool:
    """True when the Tesseract binary runs. Only success is cached, so installing
    it while the server is up takes effect on the next request."""
    global _tesseract_ready
    if _tesseract_ready:
        return True
    try:
        import pytesseract

        _configure_tesseract()
        pytesseract.get_tesseract_version()
    except Exception:  # noqa: BLE001 - any failure means the binary is unusable
        return False
    _tesseract_ready = True
    return True


def _require_tesseract() -> None:
    if not tesseract_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Tesseract OCR is not installed or not on PATH. "
                "Install it (Arch: sudo pacman -S tesseract tesseract-data-eng) "
                "or set TESSERACT_CMD to the binary path."
            ),
        )


def ocr_image(image) -> str:
    """OCR a Pillow image. Returns text (may be empty)."""
    _require_tesseract()
    import pytesseract

    _configure_tesseract()
    return pytesseract.image_to_string(image)


def _result(
    *,
    filename: str,
    source_type: str,
    text: str,
    pages_or_slides: int,
    method_per_page: list[dict[str, Any]],
    truncated: bool = False,
) -> dict[str, Any]:
    body = text or ""
    return {
        "filename": filename,
        "source_type": source_type,
        "text": body,
        "char_count": len(body),
        "pages_or_slides": pages_or_slides,
        "method_per_page": method_per_page,
        "truncated": truncated,
    }


def extract_pdf(path: str, *, filename: str | None = None) -> dict[str, Any]:
    import pymupdf
    from PIL import Image

    doc = pymupdf.open(path)
    out: list[str] = []
    methods: list[dict[str, Any]] = []
    try:
        total = len(doc)
        for i, page in enumerate(doc):
            if i >= MAX_PDF_PAGES:
                break
            text = (page.get_text() or "").strip()
            if len(text) < 20:
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text = ocr_image(img).strip()
                out.append(f"\n--- Page {i + 1} (OCR) ---\n{text}")
                methods.append({"index": i + 1, "method": "ocr"})
            else:
                out.append(f"\n--- Page {i + 1} ---\n{text}")
                methods.append({"index": i + 1, "method": "embedded"})
        n = min(total, MAX_PDF_PAGES)
        truncated = total > MAX_PDF_PAGES
    finally:
        doc.close()
    return _result(
        filename=filename or Path(path).name,
        source_type="pdf",
        text="\n".join(out).strip(),
        pages_or_slides=n,
        method_per_page=methods,
        truncated=truncated,
    )


def ocr_pdf_pages(data: bytes, *, max_pages: int, dpi: int = 200) -> list[dict[str, Any]]:
    """OCR every page of a PDF held in memory; returns [{page, text}] (blank pages omitted)."""
    import pymupdf
    from PIL import Image

    _require_tesseract()
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not open this PDF for OCR.") from exc
    pages: list[dict[str, Any]] = []
    try:
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = ocr_image(img).strip()
            if text:
                pages.append({"page": i + 1, "text": text})
    finally:
        doc.close()
    return pages


def extract_pptx(path: str, *, filename: str | None = None) -> dict[str, Any]:
    from PIL import Image
    from pptx import Presentation

    prs = Presentation(path)
    out: list[str] = []
    methods: list[dict[str, Any]] = []
    slide_count = 0
    for si, slide in enumerate(prs.slides):
        slide_count += 1
        out.append(f"\n--- Slide {si + 1} ---")
        slide_methods: set[str] = set()
        for shape in slide.shapes:
            if shape.has_text_frame:
                t = shape.text.strip()
                if t:
                    out.append(t)
                    slide_methods.add("slide_text")
            if shape.shape_type == 13:  # picture
                try:
                    img = Image.open(io.BytesIO(shape.image.blob))
                    t = ocr_image(img).strip()
                    if t:
                        out.append(f"[Image text] {t}")
                        slide_methods.add("image_ocr")
                except HTTPException:
                    raise  # e.g. Tesseract missing: surface the 503, don't skip silently
                except Exception:  # noqa: BLE001, S110 - unreadable embedded picture
                    pass
        method = "slide_text"
        if "image_ocr" in slide_methods and "slide_text" not in slide_methods:
            method = "image_ocr"
        methods.append({"index": si + 1, "method": method})
    return _result(
        filename=filename or Path(path).name,
        source_type="pptx",
        text="\n".join(out).strip(),
        pages_or_slides=slide_count,
        method_per_page=methods,
    )


def extract_docx(path: str, *, filename: str | None = None) -> dict[str, Any]:
    """Word text (paragraphs, then tables) plus OCR of pictures embedded in the document."""
    from docx import Document
    from PIL import Image

    try:
        doc = Document(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read this Word document.") from exc
    out: list[str] = []
    methods: list[dict[str, Any]] = []
    paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    if paras:
        out.append("\n".join(paras))
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
            if cells:
                out.append(" | ".join(cells))
    if out:
        methods.append({"index": 1, "method": "doc_text"})
    pictures = 0
    for rel in doc.part.rels.values():
        if "image" not in rel.reltype:
            continue
        try:
            img = Image.open(io.BytesIO(rel.target_part.blob))
            t = ocr_image(img).strip()
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001, S112 - unreadable embedded picture (e.g. EMF/WMF)
            continue
        if t:
            pictures += 1
            out.append(f"[Image text] {t}")
    if pictures:
        methods.append({"index": 1, "method": "image_ocr"})
    return _result(
        filename=filename or Path(path).name,
        source_type="docx",
        text="\n\n".join(out).strip(),
        pages_or_slides=1,
        method_per_page=methods,
    )


def extract_image(path: str, *, filename: str | None = None) -> dict[str, Any]:
    from PIL import Image

    text = ocr_image(Image.open(path)).strip()
    return _result(
        filename=filename or Path(path).name,
        source_type="image",
        text=text,
        pages_or_slides=1,
        method_per_page=[{"index": 1, "method": "ocr"}],
    )


def extract_file(path: str, *, filename: str | None = None) -> dict[str, Any]:
    name = filename or Path(path).name
    ext = Path(name).suffix.lower() or Path(path).suffix.lower()
    if ext == ".ppt":
        raise HTTPException(status_code=400, detail=PPT_HINT)
    if ext == ".doc":
        raise HTTPException(status_code=400, detail=DOC_HINT)
    if ext == ".docx":
        return extract_docx(path, filename=name)
    if ext == ".pdf":
        return extract_pdf(path, filename=name)
    if ext == ".pptx":
        return extract_pptx(path, filename=name)
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"):
        return extract_image(path, filename=name)
    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported file type: {ext or '(none)'}. "
            "Allowed: PDF, PPTX, DOCX, PNG, JPG, JPEG, WEBP, TIFF, BMP."
        ),
    )


def _suffix_from_url_or_ctype(url: str, ctype: str) -> str | None:
    path = urlparse(url).path.lower().split("?")[0]
    ext = Path(path).suffix.lower()
    if ext == ".ppt":
        raise HTTPException(status_code=400, detail=PPT_HINT)
    if ext == ".doc":
        raise HTTPException(status_code=400, detail=DOC_HINT)
    if "wordprocessingml" in ctype or ext == ".docx":
        return ".docx"
    if "pdf" in ctype or ext == ".pdf":
        return ".pdf"
    if "presentation" in ctype or ext == ".pptx":
        return ".pptx"
    if "image" in ctype or ext in (".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"):
        return ext if ext in ALLOWED_EXTENSIONS else ".png"
    if ext in ALLOWED_EXTENSIONS:
        return ext
    return None


def _download(url: str) -> tuple[str, bytes, str, str]:
    """GET url, validating every redirect hop and capping the body size.

    Returns (final_url, body, content_type, charset_text_hint).
    """
    import httpx

    from app.services.url_fetch import _assert_public_http_url

    current = _assert_public_http_url(url)
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False) as client:
            for _ in range(MAX_REDIRECTS + 1):
                with client.stream("GET", current, headers=headers) as r:
                    if r.is_redirect:
                        loc = r.headers.get("location")
                        if not loc:
                            raise HTTPException(status_code=400, detail="Could not fetch that URL.")
                        current = _assert_public_http_url(str(r.url.join(loc)))
                        continue
                    r.raise_for_status()
                    declared = r.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > MAX_OCR_BYTES:
                        raise HTTPException(status_code=413, detail="Downloaded file exceeds the 50 MB limit.")
                    buf = bytearray()
                    for chunk in r.iter_bytes():
                        buf.extend(chunk)
                        if len(buf) > MAX_OCR_BYTES:
                            raise HTTPException(
                                status_code=413, detail="Downloaded file exceeds the 50 MB limit."
                            )
                    ctype = (r.headers.get("content-type") or "").lower()
                    return current, bytes(buf), ctype, r.encoding or "utf-8"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not fetch that URL.") from exc
    raise HTTPException(status_code=400, detail="Too many redirects.")


def extract_url(url: str) -> dict[str, Any]:
    from bs4 import BeautifulSoup

    safe_url, content, ctype, encoding = _download(url)
    suffix = _suffix_from_url_or_ctype(safe_url, ctype)

    if suffix:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                f.write(content)
                tmp_path = f.name
            fname = Path(urlparse(safe_url).path).name or f"download{suffix}"
            result = extract_file(tmp_path, filename=fname)
            result["source_type"] = "url_file"
            return result
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    soup = BeautifulSoup(content.decode(encoding, errors="replace"), "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    body = "\n".join(lines)
    host = urlparse(safe_url).hostname or "page"
    return _result(
        filename=host,
        source_type="html",
        text=body,
        pages_or_slides=1,
        method_per_page=[{"index": 1, "method": "html"}],
    )


def extension_allowed(filename: str) -> bool:
    ext = Path(filename or "").suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def assert_upload_size(n: int) -> None:
    if n > MAX_OCR_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB limit.")
