"""Store original material uploads (PDF / DOCX / PPTX).

Prefer Cloudinary (raw assets) when CLOUDINARY_* env is set — same idea as
Google Classroom keeping the real file. Fall back to Mongo GridFS for local
dev and pytest so tests need no cloud account.
"""

from __future__ import annotations

import io
import re
import uuid
from dataclasses import dataclass

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from gridfs import GridFS
from gridfs.errors import NoFile
from pymongo import MongoClient
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

_client: MongoClient | None = None
_cloudinary_ready = False


@dataclass(frozen=True)
class StoredFile:
    """Handle persisted on the material document."""

    file_id: str
    storage: str  # cloudinary | gridfs
    content_type: str
    file_url: str | None = None


def cloudinary_configured() -> bool:
    return bool(
        settings.CLOUDINARY_CLOUD_NAME.strip()
        and settings.CLOUDINARY_API_KEY.strip()
        and settings.CLOUDINARY_API_SECRET.strip()
    )


def _configure_cloudinary() -> None:
    global _cloudinary_ready
    if _cloudinary_ready:
        return
    import cloudinary

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME.strip(),
        api_key=settings.CLOUDINARY_API_KEY.strip(),
        api_secret=settings.CLOUDINARY_API_SECRET.strip(),
        secure=True,
    )
    _cloudinary_ready = True


def _safe_stem(filename: str) -> str:
    base = (filename or "material").rsplit(".", 1)[0]
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-._")
    return (cleaned or "material")[:80]


def _ext_of(filename: str) -> str:
    parts = (filename or "").rsplit(".", 1)
    return parts[-1].lower() if len(parts) == 2 and parts[-1] else "bin"


def _fs() -> GridFS:
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGO_URI)
    return GridFS(_client[settings.MONGO_DB])


def _gridfs_put(data: bytes, filename: str, content_type: str) -> StoredFile:
    file_id = _fs().put(data, filename=filename, content_type=content_type)
    return StoredFile(
        file_id=str(file_id),
        storage="gridfs",
        content_type=content_type,
        file_url=None,
    )


def _gridfs_get(file_id: str) -> bytes | None:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return None
    try:
        return _fs().get(oid).read()
    except NoFile:
        return None


def _gridfs_delete(file_id: str) -> None:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return
    try:
        _fs().delete(oid)
    except NoFile:
        return


def _cloudinary_put(data: bytes, filename: str, content_type: str) -> StoredFile:
    import cloudinary.uploader

    _configure_cloudinary()
    ext = _ext_of(filename)
    # Raw public_ids should include the extension so delivery URLs keep it.
    public_id = f"cogni/materials/{_safe_stem(filename)}-{uuid.uuid4().hex[:12]}.{ext}"
    result = cloudinary.uploader.upload(
        io.BytesIO(data),
        resource_type="raw",
        public_id=public_id,
        overwrite=False,
        type="upload",
    )
    return StoredFile(
        file_id=str(result["public_id"]),
        storage="cloudinary",
        content_type=content_type,
        file_url=str(result.get("secure_url") or result.get("url") or "") or None,
    )


def _cloudinary_get(file_id: str, file_url: str | None) -> bytes | None:
    _configure_cloudinary()
    url = (file_url or "").strip()
    if not url:
        import cloudinary.utils

        url, _ = cloudinary.utils.cloudinary_url(
            file_id, resource_type="raw", type="upload", secure=True
        )
    if not url:
        return None
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resp = client.get(url)
            if resp.status_code >= 400:
                return None
            return resp.content
    except httpx.HTTPError:
        return None


def _cloudinary_delete(file_id: str) -> None:
    import cloudinary.uploader

    _configure_cloudinary()
    try:
        cloudinary.uploader.destroy(file_id, resource_type="raw", invalidate=True)
    except Exception:
        return


async def store_material_file(data: bytes, filename: str, content_type: str) -> StoredFile:
    if cloudinary_configured():
        return await run_in_threadpool(_cloudinary_put, data, filename, content_type)
    return await run_in_threadpool(_gridfs_put, data, filename, content_type)


async def read_material_file(
    file_id: str,
    *,
    storage: str | None = None,
    file_url: str | None = None,
) -> bytes | None:
    backend = (storage or "").strip().lower()
    if not backend:
        backend = "cloudinary" if cloudinary_configured() and "/" in str(file_id) else "gridfs"
    if backend == "cloudinary":
        return await run_in_threadpool(_cloudinary_get, file_id, file_url)
    return await run_in_threadpool(_gridfs_get, file_id)


async def delete_material_file(
    file_id: str,
    *,
    storage: str | None = None,
) -> None:
    backend = (storage or "").strip().lower()
    if not backend:
        backend = "cloudinary" if "/" in str(file_id) else "gridfs"
    if backend == "cloudinary":
        await run_in_threadpool(_cloudinary_delete, file_id)
        return
    await run_in_threadpool(_gridfs_delete, file_id)
