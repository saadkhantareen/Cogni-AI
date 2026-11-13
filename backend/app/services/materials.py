from datetime import UTC, datetime

from fastapi import HTTPException

from app.core.config import settings as app_settings
from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services import settings as settings_service
from app.services.chunker import chunk_pages
from app.services.documents import extract_pages
from app.services.notify import log_activity, notify
from app.services.nlp import preprocess_pages
from app.services.url_fetch import fetch_url_text

MIN_PASTED_CHARS = 300


async def _get_class_or_404(class_id: str) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"_id": oid(class_id)})
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


def _assert_read_access(user: CurrentUser, cls: dict) -> None:
    if user.role == "admin":
        return
    if user.role == "teacher" and cls["teacher_id"] == user.id:
        return
    if user.role == "hod" and cls["dept_id"] == user.dept_id:
        return
    if user.role == "student" and user.id in cls.get("student_ids", []):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this class.")


def _assert_teacher_owns(user: CurrentUser, cls: dict) -> None:
    if user.role != "teacher" or cls["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this class.")


async def _max_upload_bytes() -> int:
    doc = await settings_service.get_settings()
    mb = doc.get("max_upload_mb") if doc else None
    return (mb or app_settings.MAX_UPLOAD_MB) * 1024 * 1024


def _word_count(text: str) -> int:
    return len(text.split())


def _material_summary(doc: dict, *, display_name: str | None = None) -> dict:
    out = to_out(doc)
    out["chunk_count"] = len(doc.get("chunks", []))
    out["word_count"] = _word_count(doc.get("text", ""))
    original = str(out.get("name") or "")
    out["display_name"] = (display_name or "").strip() or original
    out.pop("text", None)
    out.pop("chunks", None)
    out.pop("file_id", None)
    return out


async def _aliases_for_user(user_id: str, material_ids: list[str]) -> dict[str, str]:
    if not material_ids:
        return {}
    db = get_db()
    cursor = db.material_aliases.find(
        {"user_id": user_id, "material_id": {"$in": material_ids}}
    )
    out: dict[str, str] = {}
    async for row in cursor:
        name = str(row.get("display_name") or "").strip()
        mid = str(row.get("material_id") or "")
        if mid and name:
            out[mid] = name
    return out


async def _alias_for_user(user_id: str, material_id: str) -> str | None:
    db = get_db()
    row = await db.material_aliases.find_one(
        {"user_id": user_id, "material_id": material_id}
    )
    if not row:
        return None
    name = str(row.get("display_name") or "").strip()
    return name or None


async def _delete_same_name_materials(cls: dict, name: str) -> int:
    """Remove prior materials in this class with the same name (case-insensitive)."""
    db = get_db()
    class_id = str(cls["_id"])
    cursor = db.materials.find({"class_id": class_id})
    removed = 0
    target = name.strip().lower()
    async for doc in cursor:
        if str(doc.get("name") or "").strip().lower() == target:
            file_id = doc.get("file_id")
            mid = str(doc["_id"])
            await db.materials.delete_one({"_id": doc["_id"]})
            await db.material_aliases.delete_many({"material_id": mid})
            if file_id:
                from app.services.material_files import delete_material_file

                await delete_material_file(str(file_id))
            removed += 1
    return removed


async def _insert_material(
    actor: CurrentUser,
    cls: dict,
    *,
    name: str,
    kind: str,
    text: str,
    chunks: list[dict],
    replace: bool = False,
    file_id: str | None = None,
) -> dict:
    db = get_db()
    if replace:
        await _delete_same_name_materials(cls, name)
    doc = {
        "class_id": str(cls["_id"]),
        "owner_id": actor.id,
        "name": name,
        "kind": kind,
        "text": text,
        "chunks": chunks,
        "created_at": datetime.now(UTC),
    }
    if file_id:
        doc["file_id"] = file_id
    result = await db.materials.insert_one(doc)
    doc["_id"] = result.inserted_id

    await notify(
        cls.get("student_ids", []),
        f"New material in {cls['code']}: {name}",
        "materials",
        str(result.inserted_id),
        actor.id,
    )
    await log_activity(actor, f"Uploaded material '{name}' to {cls['code']}")
    return _material_summary(doc)


async def upload_pdf_material(
    actor: CurrentUser,
    class_id: str,
    *,
    filename: str,
    data: bytes,
    replace: bool = False,
) -> dict:
    """Upload PDF / DOCX / PPTX. Name kept for API compatibility."""
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)

    max_bytes = await _max_upload_bytes()
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File is larger than the {max_bytes // (1024 * 1024)} MB limit.",
        )

    kind, pages = await extract_pages(filename, data)
    pages = preprocess_pages(pages)
    chunks = chunk_pages(pages)
    text = "\n\n".join(p["text"] for p in pages)
    from app.services.material_files import store_material_file

    content_type = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }.get(kind, "application/octet-stream")
    file_id = await store_material_file(data, filename, content_type)
    return await _insert_material(
        actor,
        cls,
        name=filename,
        kind=kind,
        text=text,
        chunks=chunks,
        replace=replace,
        file_id=file_id,
    )


async def upload_text_material(actor: CurrentUser, class_id: str, *, name: str, text: str) -> dict:
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)

    text = text.strip()
    if len(text) < MIN_PASTED_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Pasted text must be at least {MIN_PASTED_CHARS} characters.",
        )
    pages = preprocess_pages([{"page": None, "text": text}])
    chunks = chunk_pages(pages)
    text = "\n\n".join(p["text"] for p in pages)
    return await _insert_material(actor, cls, name=name, kind="text", text=text, chunks=chunks)


async def upload_url_material(actor: CurrentUser, class_id: str, *, url: str, name: str | None = None) -> dict:
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)

    title, text = fetch_url_text(url)
    display_name = (name or "").strip() or title
    pages = preprocess_pages([{"page": None, "text": text}])
    chunks = chunk_pages(pages)
    text = "\n\n".join(p["text"] for p in pages)
    return await _insert_material(
        actor, cls, name=display_name, kind="url", text=text, chunks=chunks
    )


async def list_materials(user: CurrentUser, class_id: str) -> list[dict]:
    cls = await _get_class_or_404(class_id)
    _assert_read_access(user, cls)
    db = get_db()
    docs = [m async for m in db.materials.find({"class_id": class_id}).sort("created_at", -1)]
    aliases = await _aliases_for_user(user.id, [str(m["_id"]) for m in docs])
    return [
        _material_summary(m, display_name=aliases.get(str(m["_id"])))
        for m in docs
    ]


async def _get_material_or_404(material_id: str) -> dict:
    db = get_db()
    doc = await db.materials.find_one({"_id": oid(material_id)})
    if doc is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    return doc


async def get_material(user: CurrentUser, material_id: str) -> dict:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_read_access(user, cls)
    out = to_out(doc)
    alias = await _alias_for_user(user.id, material_id)
    original = str(out.get("name") or "")
    out["display_name"] = alias or original
    return out


async def set_material_alias(
    user: CurrentUser, material_id: str, display_name: str
) -> dict:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_read_access(user, cls)
    name = (display_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Display name is required.")
    if len(name) > 200:
        raise HTTPException(status_code=400, detail="Display name is too long.")
    db = get_db()
    now = datetime.now(UTC)
    await db.material_aliases.update_one(
        {"user_id": user.id, "material_id": material_id},
        {
            "$set": {
                "user_id": user.id,
                "material_id": material_id,
                "display_name": name,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    return _material_summary(doc, display_name=name)


async def clear_material_alias(user: CurrentUser, material_id: str) -> dict:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_read_access(user, cls)
    db = get_db()
    await db.material_aliases.delete_one(
        {"user_id": user.id, "material_id": material_id}
    )
    return _material_summary(doc)


async def delete_material(actor: CurrentUser, material_id: str) -> None:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_teacher_owns(actor, cls)

    db = get_db()
    blocking = await db.exams.find_one(
        {"material_ids": material_id, "status": {"$ne": "draft"}}
    )
    if blocking:
        raise HTTPException(
            status_code=409,
            detail="This material is used by a non-draft exam and cannot be deleted.",
        )
    file_id = doc.get("file_id")
    material_id = str(doc["_id"])
    await db.materials.delete_one({"_id": doc["_id"]})
    await db.material_aliases.delete_many({"material_id": material_id})
    if file_id:
        from app.services.material_files import delete_material_file

        await delete_material_file(str(file_id))
    await log_activity(actor, f"Deleted material '{doc['name']}' from {cls['code']}")


async def material_preview_pdf(user: CurrentUser, material_id: str) -> tuple[bytes, str]:
    """PDF the teacher can open in the viewer.

    Original bytes are returned for stored PDFs. Everything else (Word,
    slides, pasted notes, older uploads with no file) is rendered from the
    extracted text.
    """
    from app.services.material_files import read_material_file
    from app.services.material_preview import build_material_preview_pdf, preview_filename

    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_read_access(user, cls)
    name = str(doc.get("name") or "material")
    if doc.get("kind") == "pdf" and doc.get("file_id"):
        original = await read_material_file(str(doc["file_id"]))
        if original and original.startswith(b"%PDF"):
            filename = name if name.lower().endswith(".pdf") else f"{name}.pdf"
            return original, filename
    return build_material_preview_pdf(name, doc.get("text") or ""), preview_filename(name)
