"""CPU-only OCR Studio endpoints."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.core.deps import CurrentUser, require_role
from app.schemas.ocr import OcrHealthOut, OcrResultOut, OcrUrlRequest
from app.services import ocr_service

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

_any_role = require_role("admin", "hod", "teacher", "student")


@router.get("/health", response_model=OcrHealthOut)
async def ocr_health():
    return OcrHealthOut(status="ok", tesseract=ocr_service.tesseract_available())


@router.post("/file", response_model=OcrResultOut)
async def ocr_file(
    file: UploadFile = File(...),
    _user: CurrentUser = Depends(_any_role),
):
    name = file.filename or "upload"
    if Path(name).suffix.lower() == ".ppt":
        raise HTTPException(status_code=400, detail=ocr_service.PPT_HINT)
    if Path(name).suffix.lower() == ".doc":
        raise HTTPException(status_code=400, detail=ocr_service.DOC_HINT)
    if not ocr_service.extension_allowed(name):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: {Path(name).suffix or '(none)'}. "
                "Allowed: PDF, PPTX, DOCX, PNG, JPG, JPEG, WEBP, TIFF, BMP."
            ),
        )

    data = await file.read()
    ocr_service.assert_upload_size(len(data))

    suffix = Path(name).suffix.lower() or ".bin"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        result = await run_in_threadpool(ocr_service.extract_file, tmp_path, filename=name)
        return OcrResultOut(**result)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@router.post("/url", response_model=OcrResultOut)
async def ocr_url(
    payload: OcrUrlRequest,
    _user: CurrentUser = Depends(_any_role),
):
    result = await run_in_threadpool(ocr_service.extract_url, payload.url)
    return OcrResultOut(**result)
