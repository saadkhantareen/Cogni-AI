from app.core.db import get_db, to_out

ROLES = ("admin", "hod", "teacher", "student")
EXAM_STATUSES = ("draft", "pending", "returned", "approved", "published", "closed")


async def list_activity(role: str | None, limit: int) -> list[dict]:
    db = get_db()
    query = {"role": role} if role else {}
    cursor = db.activity_log.find(query).sort("at", -1).limit(limit)
    return [to_out(a) async for a in cursor]


async def summary() -> dict:
    db = get_db()
    users_by_role = {r: await db.users.count_documents({"role": r}) for r in ROLES}
    classes_count = await db.classes.count_documents({})
    papers_by_status = {s: await db.exams.count_documents({"status": s}) for s in EXAM_STATUSES}
    recent = [to_out(a) async for a in db.activity_log.find().sort("at", -1).limit(10)]
    return {
        "users_by_role": users_by_role,
        "classes": classes_count,
        "papers_by_status": papers_by_status,
        "recent_activity": recent,
    }
