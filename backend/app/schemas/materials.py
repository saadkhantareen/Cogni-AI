from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OutBase


class MaterialChunk(BaseModel):
    idx: int
    page: int | str | None = None
    heading: str | None = None
    text: str


class MaterialOut(OutBase):
    class_id: str
    owner_id: str | None = None
    name: str
    display_name: str = ""
    kind: Literal["pdf", "docx", "pptx", "text", "url"]
    has_file: bool = False
    content_type: str | None = None
    text: str
    chunks: list[MaterialChunk] = Field(default_factory=list)
    created_at: datetime


class MaterialSummaryOut(OutBase):
    class_id: str
    owner_id: str | None = None
    name: str
    display_name: str = ""
    kind: Literal["pdf", "docx", "pptx", "text", "url"]
    has_file: bool = False
    content_type: str | None = None
    chunk_count: int
    word_count: int
    created_at: datetime


class MaterialAliasUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=200)
