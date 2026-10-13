from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OutBase

QuestionType = Literal["MCQ", "Short", "Essay"]
Bloom = Literal["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
ExamKind = Literal["Quiz", "Midterm", "Final"]
ExamStatus = Literal["draft", "pending", "returned", "approved", "published", "closed"]


class Keyword(BaseModel):
    label: str
    variants: list[str] = Field(default_factory=list)


class Question(BaseModel):
    qid: str
    type: QuestionType
    bloom: Bloom
    topic: str
    clo: str
    text: str
    options: list[str] | None = None
    answer_index: int | None = None
    model_answer: str = ""
    keywords: list[Keyword] = Field(default_factory=list)
    marks: float
    source_chunk_idx: int | None = None


class HistoryEntry(BaseModel):
    at: datetime
    by: str
    text: str


class ExamOut(OutBase):
    title: str
    class_id: str
    teacher_id: str
    kind: ExamKind
    duration_min: int
    status: ExamStatus
    questions: list[Question] = Field(default_factory=list)
    ai_threshold: int
    released: bool
    hod_comment: str = ""
    request_id: str | None = None
    material_ids: list[str] = Field(default_factory=list)
    history: list[HistoryEntry] = Field(default_factory=list)
    created_at: datetime
