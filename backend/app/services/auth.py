from app.core.db import get_db
from app.core.security import verify_password

GENERIC_LOGIN_ERROR = "Incorrect email or password."
INACTIVE_ERROR = "This account is deactivated. Ask an admin to reactivate it."

DEMO_ROLES = ("admin", "hod", "teacher", "student")
DEMO_PER_ROLE = 3


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def authenticate(email: str, password: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"email": email.strip().lower()})
    if user is None or not verify_password(password, user["password_hash"]):
        raise AuthError(401, GENERIC_LOGIN_ERROR)
    if user["status"] != "active":
        raise AuthError(403, INACTIVE_ERROR)
    return user


async def list_demo_accounts() -> list[dict]:
    """The first `DEMO_PER_ROLE` users of each role, in insertion order —
    mirrors v7's hardcoded DEMO account list."""
    db = get_db()
    accounts = []
    for role in DEMO_ROLES:
        cursor = db.users.find({"role": role}).sort("_id", 1).limit(DEMO_PER_ROLE)
        accounts.extend([user async for user in cursor])
    return accounts
