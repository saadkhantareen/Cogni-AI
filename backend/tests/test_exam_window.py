"""Exam availability window (PKT) and server-counted exam leaves."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from bson import ObjectId
from pymongo import MongoClient

from app.core.config import settings
from tests.helpers import (
    class_id_by_code,
    first_material_id,
    login_as,
    open_window,
)


def _db():
    return MongoClient(settings.MONGO_URI)[settings.MONGO_DB]


def _gen_payload(client, window: dict, *, duration_min: int = 30, title: str = "Window quiz") -> dict:
    class_id = class_id_by_code(client, "CS-201-A")
    return {
        "class_id": class_id,
        "title": title,
        "kind": "Quiz",
        "duration_min": duration_min,
        **window,
        "material_ids": [first_material_id(client, class_id)],
        "counts": {"MCQ": 1, "Short": 1},
    }


def _generate(client, window: dict, **kw):
    return client.post(
        "/api/exams/generate", json=_gen_payload(client, window, **kw), headers=login_as(client, "teacher")
    )


def _published(client, window: dict | None = None, **kw) -> dict:
    gen = _generate(client, window or open_window(), **kw)
    assert gen.status_code == 201, gen.text
    exam = gen.json()["exam"]
    pub = client.post(f"/api/exams/{exam['id']}/publish", headers=login_as(client, "teacher"))
    assert pub.status_code == 200, pub.text
    return pub.json()


def _start(client, exam_id: str, who: str = "student"):
    return client.post(f"/api/exams/{exam_id}/attempts", headers=login_as(client, who))


def _leave(client, attempt_id: str, who: str = "student", kind: str = "tab_hide"):
    return client.post(
        f"/api/attempts/{attempt_id}/leave", json={"type": kind}, headers=login_as(client, who)
    )


# ---------------- window on generate / edit / publish ----------------


def test_generate_requires_a_window(client):
    payload = _gen_payload(client, {})
    resp = client.post("/api/exams/generate", json=payload, headers=login_as(client, "teacher"))
    assert resp.status_code == 400  # validation errors use the app's uniform 400 shape


def test_generate_rejects_bad_windows(client):
    naive = {"opens_at": "2026-11-04T20:00:00", "closes_at": "2026-11-04T22:00:00"}
    backwards = open_window(120, 60)
    too_short = open_window(0, 20)  # 20-minute window for a 30-minute paper
    for window, message in (
        (naive, "timezone"),
        (backwards, "end after it starts"),
        (too_short, "shorter than"),
    ):
        resp = _generate(client, window)
        assert resp.status_code == 400, window
        assert message in str(resp.json()), resp.json()


def test_window_is_stored_in_utc_and_returned(client):
    window = {"opens_at": "2030-11-04T20:00:00+05:00", "closes_at": "2030-11-04T22:00:00+05:00"}
    exam = _generate(client, window).json()["exam"]
    doc = _db().exams.find_one({"_id": ObjectId(exam["id"])})
    assert doc["opens_at"].replace(tzinfo=UTC) == datetime(2030, 11, 4, 15, 0, tzinfo=UTC)
    assert doc["closes_at"].replace(tzinfo=UTC) == datetime(2030, 11, 4, 17, 0, tzinfo=UTC)


def test_teacher_can_change_window_before_publish(client):
    exam = _generate(client, open_window()).json()["exam"]
    headers = login_as(client, "teacher")
    ok = client.patch(f"/api/exams/{exam['id']}", json=open_window(60, 240), headers=headers)
    assert ok.status_code == 200, ok.text
    bad = client.patch(f"/api/exams/{exam['id']}", json=open_window(240, 60), headers=headers)
    assert bad.status_code == 400
    longer = client.patch(f"/api/exams/{exam['id']}", json={"duration_min": 500}, headers=headers)
    assert longer.status_code == 400  # paper would no longer fit in the window


def test_publish_refused_when_window_already_over(client):
    exam = _generate(client, open_window(-180, -60)).json()["exam"]
    resp = client.post(f"/api/exams/{exam['id']}/publish", headers=login_as(client, "teacher"))
    assert resp.status_code == 400
    assert "window" in resp.json()["detail"].lower()


# ---------------- window on start / deadline / dashboard ----------------


def test_cannot_start_before_window_opens(client):
    exam = _published(client, open_window(60, 180))
    resp = _start(client, exam["id"])
    assert resp.status_code == 400
    assert "opens at" in resp.json()["detail"]
    assert "Pakistan time" in resp.json()["detail"]


def test_cannot_start_after_window_closes(client):
    exam = _published(client)
    _db().exams.update_one(
        {"_id": ObjectId(exam["id"])},
        {"$set": {"closes_at": datetime.now(UTC) - timedelta(minutes=1)}},
    )
    resp = _start(client, exam["id"])
    assert resp.status_code == 400
    assert "closed at" in resp.json()["detail"]


def test_late_start_deadline_is_window_end(client):
    exam = _published(client, open_window(-60, 10), duration_min=30)
    body = _start(client, exam["id"]).json()
    deadline = datetime.fromisoformat(body["deadline"])
    remaining = (deadline - datetime.now(UTC)).total_seconds()
    assert 8 * 60 < remaining <= 10 * 60  # window end, not start + 30 min


def test_exam_without_window_still_works(client):
    exam = _published(client)
    _db().exams.update_one({"_id": ObjectId(exam["id"])}, {"$unset": {"opens_at": "", "closes_at": ""}})
    assert _start(client, exam["id"]).status_code == 201


def test_dashboard_shows_upcoming_and_hides_closed(client):
    upcoming = _published(client, open_window(60, 180), title="Upcoming quiz")
    closed = _published(client, title="Closed quiz")
    _db().exams.update_one(
        {"_id": ObjectId(closed["id"])},
        {"$set": {"closes_at": datetime.now(UTC) - timedelta(minutes=1)}},
    )
    live = client.get("/api/dashboard/student", headers=login_as(client, "student")).json()["live_exams"]
    ids = {e["id"]: e for e in live}
    assert upcoming["id"] in ids and ids[upcoming["id"]]["opens_at"]
    assert closed["id"] not in ids


# ---------------- leaving the exam ----------------


def test_first_leave_warns_second_leave_submits(client):
    exam = _published(client)
    attempt_id = _start(client, exam["id"]).json()["id"]

    first = _leave(client, attempt_id).json()
    assert first == {
        "status": "in_progress",
        "violation_count": 1,
        "warning_limit": 1,
        "end_reason": None,
    }

    second = _leave(client, attempt_id, kind="fullscreen_exit").json()
    assert second["status"] == "submitted"
    assert second["end_reason"] == "violations"
    assert second["violation_count"] == 2

    # Further reports are harmless and don't regrade.
    again = _leave(client, attempt_id)
    assert again.status_code == 200 and again.json()["status"] == "submitted"
    doc = _db().attempts.find_one({"_id": ObjectId(attempt_id)})
    assert [e["type"] for e in doc["integrity_events"]] == ["tab_hide", "fullscreen_exit"]


def test_reopening_the_exam_counts_as_leaving(client):
    exam = _published(client)
    first = _start(client, exam["id"]).json()
    assert first["violation_count"] == 0

    resumed = _start(client, exam["id"])  # refresh / closed tab
    assert resumed.status_code == 201
    assert resumed.json()["violation_count"] == 1

    again = _start(client, exam["id"])
    assert again.status_code == 400
    assert "left it more than once" in again.json()["detail"]
    doc = _db().attempts.find_one({"_id": ObjectId(first["id"])})
    assert doc["status"] == "submitted" and doc["end_reason"] == "violations"


def test_submit_cannot_lower_server_leave_count(client):
    exam = _published(client)
    attempt_id = _start(client, exam["id"]).json()["id"]
    _leave(client, attempt_id)
    client.post(
        f"/api/attempts/{attempt_id}/submit",
        json={"violation_count": 0},
        headers=login_as(client, "student"),
    )
    assert _db().attempts.find_one({"_id": ObjectId(attempt_id)})["violation_count"] == 1


def test_only_the_owner_can_report_a_leave(client):
    exam = _published(client)
    attempt_id = _start(client, exam["id"]).json()["id"]
    other = _leave(client, attempt_id, who="sana.iqbal@umt.edu.pk")
    assert other.status_code == 403
    teacher = _leave(client, attempt_id, who="teacher")
    assert teacher.status_code == 403
    assert _db().attempts.find_one({"_id": ObjectId(attempt_id)})["violation_count"] == 0


def test_approved_paper_can_be_rescheduled_but_not_edited(client):
    exam = _generate(client, open_window()).json()["exam"]
    _db().exams.update_one({"_id": ObjectId(exam["id"])}, {"$set": {"status": "approved"}})
    headers = login_as(client, "teacher")
    moved = client.patch(f"/api/exams/{exam['id']}", json=open_window(60, 240), headers=headers)
    assert moved.status_code == 200, moved.text
    renamed = client.patch(f"/api/exams/{exam['id']}", json={"title": "Changed"}, headers=headers)
    assert renamed.status_code == 400


def test_refresh_after_reported_leave_counts_once(client):
    """Unloading the page reports a leave; the reload right after must not count again."""
    exam = _published(client)
    attempt_id = _start(client, exam["id"]).json()["id"]
    _leave(client, attempt_id)  # sent by the page as it refreshes
    resumed = _start(client, exam["id"])
    assert resumed.status_code == 201
    assert resumed.json()["violation_count"] == 1
    assert resumed.json()["status"] == "in_progress"
