from app.core.db import get_db
from app.core.deps import CurrentUser
from app.services.notify import log_activity, notify

APPROVAL_LABELS = {"all": "all papers", "major": "midterms and finals", "none": "no papers"}


async def get_settings() -> dict:
    db = get_db()
    doc = await db.settings.find_one()
    return doc or {}


async def update_settings(
    actor: CurrentUser, approval: str, max_upload_mb: int, ai_threshold_default: int
) -> dict:
    db = get_db()
    doc = await db.settings.find_one()
    old_approval = doc.get("approval") if doc else None
    updates = {
        "approval": approval,
        "max_upload_mb": max(1, max_upload_mb),
        "ai_threshold_default": max(50, min(95, ai_threshold_default)),
    }
    if doc:
        await db.settings.update_one({"_id": doc["_id"]}, {"$set": updates})
    else:
        await db.settings.insert_one(dict(updates))

    if old_approval is not None and old_approval != approval:
        recipients = [
            str(u["_id"]) async for u in db.users.find({"role": {"$in": ["teacher", "hod"]}})
        ]
        await notify(
            recipients,
            f"Admin changed HOD approval to: {APPROVAL_LABELS.get(approval, approval)}",
            actor_id=actor.id,
        )

    await log_activity(
        actor,
        f"Updated settings: approval {approval}, threshold {updates['ai_threshold_default']}%, "
        f"upload {updates['max_upload_mb']} MB",
    )
    return updates
