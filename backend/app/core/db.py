from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import AsyncMongoClient

from app.core.config import settings

client: AsyncMongoClient | None = None


def get_db():
    return client[settings.MONGO_DB]


async def create_indexes():
    """Call explicitly (e.g. from seed.py) once a database is reachable.
    Not run from lifespan: it would make every app startup depend on Mongo
    being up, including for `pytest`/`uvicorn` runs that don't need it yet.
    """
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.classes.create_index("join_code", unique=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = AsyncMongoClient(settings.MONGO_URI)
    yield
    await client.close()
