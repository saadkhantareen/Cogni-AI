from typing import Literal

from app.schemas.common import OutBase

Role = Literal["admin", "hod", "teacher", "student"]
UserStatus = Literal["active", "inactive"]


class UserOut(OutBase):
    name: str
    email: str
    role: Role
    dept_id: str | None = None
    status: UserStatus
