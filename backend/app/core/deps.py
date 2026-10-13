from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from pydantic import BaseModel

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.users import Role, UserStatus

bearer_scheme = HTTPBearer(auto_error=False)

AUTH_ERROR = "Could not validate credentials."


class CurrentUser(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    dept_id: str | None
    status: UserStatus


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)
    try:
        payload = decode_token(credentials.credentials)
        user_oid = ObjectId(payload["sub"])
    except (PyJWTError, InvalidId, TypeError, KeyError):
        raise HTTPException(status_code=401, detail=AUTH_ERROR)

    db = get_db()
    doc = await db.users.find_one({"_id": user_oid})
    if doc is None:
        raise HTTPException(status_code=401, detail=AUTH_ERROR)
    if doc["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="This account is deactivated. Ask an admin to reactivate it.",
        )
    return CurrentUser(
        id=str(doc["_id"]),
        name=doc["name"],
        email=doc["email"],
        role=doc["role"],
        dept_id=doc.get("dept_id"),
        status=doc["status"],
    )


def require_role(*roles: str):
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )
        return user

    return checker


def teacher_owns_class(user: CurrentUser, cls: dict) -> bool:
    return user.role == "teacher" and cls.get("teacher_id") == user.id


def student_in_class(user: CurrentUser, cls: dict) -> bool:
    return user.role == "student" and user.id in cls.get("student_ids", [])


def hod_owns_dept(user: CurrentUser, dept_id: str | None) -> bool:
    return user.role == "hod" and dept_id is not None and user.dept_id == dept_id
