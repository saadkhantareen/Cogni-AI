import os

import pytest
from bson import ObjectId
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.seed import main as seed_main

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")


@pytest.fixture
async def seeded_db():
    settings.MONGO_DB = TEST_DB
    await seed_main(force=False)
    client = AsyncMongoClient(settings.MONGO_URI)
    db = client[TEST_DB]
    yield db
    await client.close()


async def test_seed_creates_demo_users(seeded_db):
    count = await seeded_db.users.count_documents({})
    assert count >= 12


async def test_every_class_has_teacher_in_same_department(seeded_db):
    async for cls in seeded_db.classes.find():
        teacher = await seeded_db.users.find_one({"_id": ObjectId(cls["teacher_id"])})
        assert teacher is not None
        assert teacher["dept_id"] == cls["dept_id"]


async def test_every_exam_class_exists(seeded_db):
    async for exam in seeded_db.exams.find():
        cls = await seeded_db.classes.find_one({"_id": ObjectId(exam["class_id"])})
        assert cls is not None


async def test_every_attempt_references_existing_exam_and_student(seeded_db):
    async for attempt in seeded_db.attempts.find():
        exam = await seeded_db.exams.find_one({"_id": ObjectId(attempt["exam_id"])})
        student = await seeded_db.users.find_one({"_id": ObjectId(attempt["student_id"])})
        assert exam is not None
        assert student is not None
