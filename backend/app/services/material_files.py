"""Store original uploads in GridFS so teachers can open them later.

The async app client has no GridFS helper in this pymongo build, so reads
and writes go through a small sync client on a worker thread.
"""

from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from gridfs import GridFS
from gridfs.errors import NoFile
from pymongo import MongoClient
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

_client: MongoClient | None = None


def _fs() -> GridFS:
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGO_URI)
    return GridFS(_client[settings.MONGO_DB])


def _put(data: bytes, filename: str, content_type: str) -> str:
    file_id = _fs().put(data, filename=filename, content_type=content_type)
    return str(file_id)


def _get(file_id: str) -> bytes | None:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return None
    try:
        return _fs().get(oid).read()
    except NoFile:
        return None


def _delete(file_id: str) -> None:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return
    try:
        _fs().delete(oid)
    except NoFile:
        return


async def store_material_file(data: bytes, filename: str, content_type: str) -> str:
    return await run_in_threadpool(_put, data, filename, content_type)


async def read_material_file(file_id: str) -> bytes | None:
    return await run_in_threadpool(_get, file_id)


async def delete_material_file(file_id: str) -> None:
    await run_in_threadpool(_delete, file_id)
