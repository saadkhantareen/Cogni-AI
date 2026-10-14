"""Auth security: login, JWT hardening, /me, reset-password, deactivated tokens."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.core.security import hash_password
from tests.helpers import DEMO_PASSWORD, login_as

# First 3 of each role in seed insertion order (see app/seed.py + demo-accounts).
EXPECTED_DEMO_EMAILS = {
    "admin@cogni.pk",
    "imran.butt@cogni.pk",
    "it.support@cogni.pk",
    "tariq.mehmood@umt.edu.pk",
    "samina.javed@umt.edu.pk",
    "kamran.yousaf@umt.edu.pk",
    "ayesha.khan@umt.edu.pk",
    "faisal.aziz@umt.edu.pk",
    "nida.shah@umt.edu.pk",
    "hamza.ali@umt.edu.pk",
    "sana.iqbal@umt.edu.pk",
    "bilal.ahmed@umt.edu.pk",
}

GENERIC_LOGIN_DETAIL = "Incorrect email or password."


async def _set_user_status(email: str, status: str) -> None:
    conn = AsyncMongoClient(settings.MONGO_URI)
    await conn[settings.MONGO_DB].users.update_one({"email": email}, {"$set": {"status": status}})
    await conn.close()


async def _set_password_hash(email: str, password: str) -> None:
    conn = AsyncMongoClient(settings.MONGO_URI)
    await conn[settings.MONGO_DB].users.update_one(
        {"email": email}, {"$set": {"password_hash": hash_password(password)}}
    )
    await conn.close()


def _b64url(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


# No student self-signup endpoint exists; do not invent one.
@pytest.mark.security
@pytest.mark.skip(reason="No student self-signup endpoint; do not invent one.")
def test_student_self_signup_not_available():
    pass


@pytest.mark.api
@pytest.mark.security
def test_login_success_for_all_demo_accounts(client):
    resp = client.get("/api/auth/demo-accounts")
    assert resp.status_code == 200
    accounts = resp.json()
    assert len(accounts) == 12
    emails = {a["email"] for a in accounts}
    assert emails == EXPECTED_DEMO_EMAILS

    for account in accounts:
        login = client.post(
            "/api/auth/login",
            json={"email": account["email"], "password": DEMO_PASSWORD},
        )
        assert login.status_code == 200, f"{account['email']}: {login.text}"
        body = login.json()
        assert body["user"]["email"] == account["email"]
        assert body["user"]["role"] == account["role"]
        assert body["token_type"] == "bearer"
        assert body["access_token"]


@pytest.mark.api
@pytest.mark.security
def test_login_wrong_password_and_unknown_email_same_401(client):
    wrong_pw = client.post(
        "/api/auth/login",
        json={"email": "admin@cogni.pk", "password": "definitely-wrong"},
    )
    unknown = client.post(
        "/api/auth/login",
        json={"email": "nobody@cogni.pk", "password": DEMO_PASSWORD},
    )
    assert wrong_pw.status_code == 401
    assert unknown.status_code == 401
    assert wrong_pw.json()["code"] == "UNAUTHORIZED"
    assert unknown.json()["code"] == "UNAUTHORIZED"
    assert wrong_pw.json()["detail"] == GENERIC_LOGIN_DETAIL
    assert unknown.json()["detail"] == GENERIC_LOGIN_DETAIL
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


@pytest.mark.api
@pytest.mark.security
async def test_login_inactive_account_is_403(client):
    await _set_user_status("hamza.ali@umt.edu.pk", "inactive")
    resp = client.post(
        "/api/auth/login",
        json={"email": "hamza.ali@umt.edu.pk", "password": DEMO_PASSWORD},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"
    assert "deactivated" in resp.json()["detail"].lower()


@pytest.mark.api
@pytest.mark.security
@pytest.mark.parametrize(
    "body",
    [
        {},
        {"email": "admin@cogni.pk"},
        {"password": DEMO_PASSWORD},
        {"email": 123, "password": DEMO_PASSWORD},
        {"email": None, "password": DEMO_PASSWORD},
    ],
)
def test_login_missing_or_malformed_fields(client, body):
    # App maps RequestValidationError → 400 VALIDATION_ERROR (not FastAPI's default 422).
    resp = client.post("/api/auth/login", json=body)
    assert resp.status_code in (400, 422)
    assert resp.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.api
@pytest.mark.security
def test_token_claims_sub_role_exp(client):
    login = client.post(
        "/api/auth/login",
        json={"email": "ayesha.khan@umt.edu.pk", "password": DEMO_PASSWORD},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    user_id = login.json()["user"]["id"]
    claims = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    assert claims["sub"] == user_id
    assert claims["role"] == "teacher"
    assert "exp" in claims
    assert claims["exp"] > datetime.now(UTC).timestamp()


@pytest.mark.api
@pytest.mark.security
@pytest.mark.parametrize(
    "token_factory",
    [
        "expired",
        "tampered",
        "wrong_secret",
        "alg_none",
        "missing_bearer",
    ],
)
def test_invalid_tokens_rejected_on_me(client, token_factory):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@cogni.pk", "password": DEMO_PASSWORD},
    )
    valid = login.json()["access_token"]
    user_id = login.json()["user"]["id"]

    if token_factory == "expired":
        token = jwt.encode(
            {
                "sub": user_id,
                "role": "admin",
                "exp": datetime.now(UTC) - timedelta(minutes=5),
            },
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {token}"}
    elif token_factory == "tampered":
        # Flip one character in the signature segment.
        parts = valid.split(".")
        sig = parts[2]
        flipped = ("A" if sig[0] != "A" else "B") + sig[1:]
        token = f"{parts[0]}.{parts[1]}.{flipped}"
        headers = {"Authorization": f"Bearer {token}"}
    elif token_factory == "wrong_secret":
        token = jwt.encode(
            {
                "sub": user_id,
                "role": "admin",
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
            "totally-different-secret-key-32b!!",
            algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {token}"}
    elif token_factory == "alg_none":
        header = _b64url({"alg": "none", "typ": "JWT"})
        payload = _b64url({"sub": user_id, "role": "admin"})
        token = f"{header}.{payload}."
        headers = {"Authorization": f"Bearer {token}"}
    else:  # missing_bearer
        headers = {"Authorization": valid}

    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


@pytest.mark.api
@pytest.mark.security
def test_me_returns_user_without_password_hash(client):
    headers = login_as(client, "teacher")
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "ayesha.khan@umt.edu.pk"
    assert body["role"] == "teacher"
    assert body["status"] == "active"
    assert "password_hash" not in body
    assert "password" not in body


@pytest.mark.api
@pytest.mark.security
async def test_admin_reset_password_restores_demo123(client):
    email = "sana.iqbal@umt.edu.pk"
    custom = "CustomPass!99"
    await _set_password_hash(email, custom)

    assert (
        client.post("/api/auth/login", json={"email": email, "password": custom}).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": DEMO_PASSWORD}
        ).status_code
        == 401
    )

    user_id = client.get("/api/auth/me", headers=login_as(client, email, password=custom)).json()[
        "id"
    ]
    reset = client.post(
        f"/api/admin/users/{user_id}/reset-password",
        headers=login_as(client, "admin"),
    )
    assert reset.status_code == 204

    assert (
        client.post("/api/auth/login", json={"email": email, "password": custom}).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": DEMO_PASSWORD}
        ).status_code
        == 200
    )


@pytest.mark.api
@pytest.mark.security
async def test_deactivated_users_existing_token_stops_on_me(client):
    login = client.post(
        "/api/auth/login",
        json={"email": "bilal.ahmed@umt.edu.pk", "password": DEMO_PASSWORD},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    await _set_user_status("bilal.ahmed@umt.edu.pk", "inactive")
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"
    assert "deactivated" in resp.json()["detail"].lower()
