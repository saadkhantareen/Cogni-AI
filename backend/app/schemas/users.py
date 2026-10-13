from typing import Literal

from pydantic import BaseModel

from app.schemas.common import OutBase

Role = Literal["admin", "hod", "teacher", "student"]
UserStatus = Literal["active", "inactive"]


class UserOut(OutBase):
    name: str
    email: str
    role: Role
    dept_id: str | None = None
    status: UserStatus


class UserCreate(BaseModel):
    name: str
    email: str
    role: Role
    dept_id: str | None = None


class UserUpdate(BaseModel):
    role: Role | None = None
    dept_id: str | None = None
    status: UserStatus | None = None
