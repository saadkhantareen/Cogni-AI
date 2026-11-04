"""OCR Studio API: health, type/size rejection, .ppt hint, SSRF on URL."""

from __future__ import annotations

import io

from tests.helpers import login_as


def test_ocr_health_public(client):
    resp = client.get("/api/ocr/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ocr_file_requires_auth(client):
    resp = client.post(
        "/api/ocr/file",
        files={"file": ("note.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 401


def test_ocr_file_rejects_exe(client):
    headers = login_as(client, "teacher")
    resp = client.post(
        "/api/ocr/file",
        files={"file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "unsupported" in resp.json()["detail"].lower()


def test_ocr_file_rejects_ppt(client):
    headers = login_as(client, "teacher")
    resp = client.post(
        "/api/ocr/file",
        files={"file": ("old.ppt", b"\xd0\xcf\x11\xe0", "application/vnd.ms-powerpoint")},
        headers=headers,
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "libreoffice" in detail or "soffice" in detail


def test_ocr_file_rejects_oversize(client):
    headers = login_as(client, "teacher")
    from app.services import ocr_service

    original = ocr_service.MAX_OCR_BYTES
    ocr_service.MAX_OCR_BYTES = 100
    try:
        resp = client.post(
            "/api/ocr/file",
            files={"file": ("big.pdf", b"x" * 200, "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 413
    finally:
        ocr_service.MAX_OCR_BYTES = original


def test_ocr_url_rejects_private_host(client):
    headers = login_as(client, "teacher")
    resp = client.post(
        "/api/ocr/url",
        json={"url": "http://127.0.0.1/secret"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"].lower()


def test_ocr_extract_plain_pdf_text(client):
    """Native text PDF via PyMuPDF (no Tesseract required)."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Cogni OCR smoke text for native PDF extraction.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    pdf_bytes = buf.getvalue()

    headers = login_as(client, "teacher")
    resp = client.post(
        "/api/ocr/file",
        files={"file": ("native.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source_type"] == "pdf"
    assert "Cogni OCR smoke" in body["text"]
    assert body["pages_or_slides"] == 1
    assert body["method_per_page"][0]["method"] == "embedded"


# ---- Real Tesseract OCR (skipped when the binary is missing) ----

import pytest

from app.services import ocr_service

needs_tesseract = pytest.mark.skipif(
    not ocr_service.tesseract_available(), reason="Tesseract binary not installed"
)


def _text_image(text: str):
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (900, 200), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=48)
    except TypeError:
        font = ImageFont.load_default()
    draw.text((30, 60), text, fill="black", font=font)
    return img


def _png_bytes(text: str) -> bytes:
    buf = io.BytesIO()
    _text_image(text).save(buf, format="PNG")
    return buf.getvalue()


def _scanned_pdf(text: str, pages: int = 1) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_image(pymupdf.Rect(40, 40, 555, 160), stream=_png_bytes(text))
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def _post(client, headers, name, data, ctype="application/octet-stream"):
    return client.post("/api/ocr/file", files={"file": (name, data, ctype)}, headers=headers)


@needs_tesseract
def test_ocr_health_reports_tesseract(client):
    assert client.get("/api/ocr/health").json()["tesseract"] is True


@needs_tesseract
def test_ocr_image_reads_text(client):
    headers = login_as(client, "student")
    resp = _post(client, headers, "note.png", _png_bytes("Photosynthesis converts light"), "image/png")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source_type"] == "image"
    assert "photosynthesis" in body["text"].lower()
    assert body["method_per_page"][0]["method"] == "ocr"


@needs_tesseract
def test_ocr_scanned_pdf_falls_back_to_ocr(client):
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "scan.pdf", _scanned_pdf("Normalization removes redundancy"), "application/pdf")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["method_per_page"][0]["method"] == "ocr"
    assert "normalization" in body["text"].lower()
    assert "(OCR)" in body["text"]
    assert body["truncated"] is False


@needs_tesseract
def test_ocr_pdf_page_cap(client, monkeypatch):
    monkeypatch.setattr(ocr_service, "MAX_PDF_PAGES", 2)
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "long.pdf", _scanned_pdf("Page text here", pages=3), "application/pdf")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["pages_or_slides"] == 2
    assert body["truncated"] is True


@needs_tesseract
def test_ocr_pptx_text_and_picture(client):
    from pptx import Presentation
    from pptx.util import Inches

    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[5])
    s1.shapes.title.text = "Slide heading about databases"
    s2 = prs.slides.add_slide(prs.slide_layouts[6])
    s2.shapes.add_picture(io.BytesIO(_png_bytes("Indexes speed queries")), Inches(0.5), Inches(1), Inches(8))
    buf = io.BytesIO()
    prs.save(buf)

    headers = login_as(client, "hod")
    resp = _post(client, headers, "deck.pptx", buf.getvalue())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["pages_or_slides"] == 2
    assert "databases" in body["text"].lower()
    assert "indexes" in body["text"].lower()
    assert [m["method"] for m in body["method_per_page"]] == ["slide_text", "image_ocr"]


@pytest.mark.parametrize("role", ["admin", "hod", "teacher", "student"])
@needs_tesseract
def test_ocr_every_role_can_extract(client, role):
    headers = login_as(client, role)
    resp = _post(client, headers, "r.png", _png_bytes("Role access check"), "image/png")
    assert resp.status_code == 200, resp.text


def test_ocr_503_when_tesseract_missing(client, monkeypatch):
    monkeypatch.setattr(ocr_service, "tesseract_available", lambda: False)
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "r.png", _png_bytes("x"), "image/png")
    assert resp.status_code == 503
    assert "tesseract" in resp.json()["detail"].lower()


def test_ocr_temp_files_removed(client, monkeypatch):
    import tempfile
    from pathlib import Path

    seen = []
    real = ocr_service.extract_file

    def spy(path, filename=None):
        seen.append(path)
        return real(path, filename=filename)

    monkeypatch.setattr(ocr_service, "extract_file", spy)
    import pymupdf

    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "Temp file cleanup check for native text PDFs.")
    buf = io.BytesIO()
    doc.save(buf)
    headers = login_as(client, "teacher")
    assert _post(client, headers, "t.pdf", buf.getvalue(), "application/pdf").status_code == 200
    assert seen and not Path(seen[0]).exists()
    assert Path(tempfile.gettempdir()).exists()


def test_ocr_url_redirect_to_private_host_rejected(client, monkeypatch):
    """A public URL that redirects to loopback must be blocked at the hop."""
    import httpx

    from app.services import url_fetch

    monkeypatch.setattr(
        url_fetch, "_is_private_ip", lambda ip: ip.startswith("127.") or ip == "::1"
    )
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda host, port, **kw: [(2, 1, 6, "", ("127.0.0.1" if host == "internal.test" else "93.184.216.34", 80))],
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "public.test":
            return httpx.Response(302, headers={"location": "http://internal.test/admin"})
        return httpx.Response(200, text="secret")

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kw: real_client(transport=transport, **kw)
    )
    headers = login_as(client, "teacher")
    resp = client.post("/api/ocr/url", json={"url": "http://public.test/x"}, headers=headers)
    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"].lower()


def test_ocr_url_html_and_oversize(client, monkeypatch):
    import httpx

    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda host, port, **kw: [(2, 1, 6, "", ("93.184.216.34", 80))],
    )
    html = "<html><body><nav>skip</nav><p>Hello OCR world</p><script>x()</script></body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/big":
            return httpx.Response(200, content=b"x" * 500, headers={"content-type": "text/html"})
        return httpx.Response(200, text=html, headers={"content-type": "text/html"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=transport, **kw))
    headers = login_as(client, "student")
    ok = client.post("/api/ocr/url", json={"url": "http://site.test/page"}, headers=headers)
    assert ok.status_code == 200, ok.text
    assert ok.json()["text"] == "Hello OCR world"
    assert ok.json()["source_type"] == "html"

    monkeypatch.setattr(ocr_service, "MAX_OCR_BYTES", 100)
    big = client.post("/api/ocr/url", json={"url": "http://site.test/big"}, headers=headers)
    assert big.status_code == 413


def _docx_bytes(with_picture: bool) -> bytes:
    from docx import Document
    from docx.shared import Inches

    doc = Document()
    doc.add_paragraph("Chapter one covers linked lists and stacks.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Structure"
    table.rows[0].cells[1].text = "Binary heap"
    if with_picture:
        doc.add_picture(io.BytesIO(_png_bytes("Graphs model networks")), width=Inches(5))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_ocr_docx_text_and_table(client):
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "notes.docx", _docx_bytes(False))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source_type"] == "docx"
    assert "linked lists" in body["text"]
    assert "Structure | Binary heap" in body["text"]
    assert [m["method"] for m in body["method_per_page"]] == ["doc_text"]


@needs_tesseract
def test_ocr_docx_reads_embedded_picture(client):
    headers = login_as(client, "student")
    resp = _post(client, headers, "pic.docx", _docx_bytes(True))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "graphs" in body["text"].lower()
    assert "[Image text]" in body["text"]
    assert [m["method"] for m in body["method_per_page"]] == ["doc_text", "image_ocr"]


def test_ocr_docx_corrupt_is_400(client):
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "bad.docx", b"not a zip")
    assert resp.status_code == 400


def test_ocr_old_doc_gets_hint(client):
    headers = login_as(client, "teacher")
    resp = _post(client, headers, "old.doc", b"\xd0\xcf\x11\xe0")
    assert resp.status_code == 400
    assert "docx" in resp.json()["detail"].lower()
