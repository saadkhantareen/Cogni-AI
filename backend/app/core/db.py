from contextlib import asynccontextmanager

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from pymongo import AsyncMongoClient

from app.core.config import settings

client: AsyncMongoClient | None = None


def get_db():
    return client[settings.MONGO_DB]


def oid(id_str: str) -> ObjectId:
    """Parse a string id into an ObjectId, or raise a 404 if it's not valid."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Not found")


def to_out(doc: dict) -> dict:
    """Shape a Mongo document for the API: `_id` (ObjectId) -> `id` (str)."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


async def create_indexes():
    """Call explicitly (e.g. from seed.py) once a database is reachable.
    Not run from lifespan: it would make every app startup depend on Mongo
    being up, including for `pytest`/`uvicorn` runs that don't need it yet.
    """
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.classes.create_index("join_code", unique=True)
    await db.classes.create_index("teacher_id")
    await db.exams.create_index("class_id")
    await db.exams.create_index("status")
    await db.attempts.create_index([("exam_id", 1), ("student_id", 1)], unique=True)
    await db.notifications.create_index([("to_user_id", 1), ("created_at", -1)])
    await db.activity_log.create_index([("at", -1)])


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = AsyncMongoClient(settings.MONGO_URI)
    yield
    await client.close()
