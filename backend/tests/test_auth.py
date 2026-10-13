import os

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.core.deps import require_role
from app.main import app
from app.seed import main as seed_main

TEST_DB = os.environ.get("TEST_MONGO_DB", "cogni_test_dev")

# A throwaway admin-only route, mounted only for this test module, to prove
# require_role() rejects the wrong role. Not part of the real API surface.
_test_router = APIRouter()


@_test_router.get("/api/_test/admin-only")
async def _admin_only(user=Depends(require_role("admin"))):
    return {"ok": True}


app.include_router(_test_router)


@pytest.fixture
async def client():
    settings.MONGO_DB = TEST_DB
    await seed_main(force=False)
    with TestClient(app) as c:
        yield c


async def _set_status(email: str, status: str) -> None:
    conn = AsyncMongoClient(settings.MONGO_URI)
    await conn[TEST_DB].users.update_one({"email": email}, {"$set": {"status": status}})
    await conn.close()


def _login(client, email, password="demo123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.mark.parametrize(
    "email,role",
    [
        ("admin@cogni.pk", "admin"),
        ("tariq.mehmood@umt.edu.pk", "hod"),
        ("ayesha.khan@umt.edu.pk", "teacher"),
        ("hamza.ali@umt.edu.pk", "student"),
    ],
)
def test_login_ok_for_each_role(client, email, role):
    resp = _login(client, email)
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == email
    assert body["user"]["role"] == role
    assert "access_token" in body


def test_login_email_is_case_insensitive(client):
    resp = _login(client, "ADMIN@Cogni.pk")
    assert resp.status_code == 200


def test_login_wrong_password(client):
    resp = _login(client, "admin@cogni.pk", password="wrong-password")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"
    assert "incorrect" in body["detail"].lower()


def test_login_unknown_email(client):
    resp = _login(client, "nobody@cogni.pk")
    assert resp.status_code == 401


async def test_login_inactive_user_blocked(client):
    await _set_status("hamza.ali@umt.edu.pk", "inactive")
    resp = _login(client, "hamza.ali@umt.edu.pk")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "This account is deactivated. Ask an admin to reactivate it."


def test_me_returns_current_user(client):
    token = _login(client, "ayesha.khan@umt.edu.pk").json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "ayesha.khan@umt.edu.pk"
    assert body["role"] == "teacher"
    assert "password_hash" not in body


def test_token_missing_is_unauthorized(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


def test_role_guard_rejects_wrong_role(client):
    token = _login(client, "hamza.ali@umt.edu.pk").json()["access_token"]  # student
    resp = client.get("/api/_test/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


def test_role_guard_allows_correct_role(client):
    token = _login(client, "admin@cogni.pk").json()["access_token"]
    resp = client.get("/api/_test/admin-only", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_demo_accounts_returns_twelve_without_hashes(client):
    resp = client.get("/api/auth/demo-accounts")
    assert resp.status_code == 200
    accounts = resp.json()
    assert len(accounts) == 12
    counts = {}
    for a in accounts:
        assert "password_hash" not in a
        counts[a["role"]] = counts.get(a["role"], 0) + 1
    assert counts == {"admin": 3, "hod": 3, "teacher": 3, "student": 3}
