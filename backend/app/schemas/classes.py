from pydantic import Field

from app.schemas.common import OutBase


class ClassOut(OutBase):
    code: str
    name: str
    teacher_id: str
    dept_id: str
    student_ids: list[str] = Field(default_factory=list)
    join_code: str
    clos: list[str] = Field(default_factory=list)
    section: str
