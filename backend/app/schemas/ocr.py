from typing import Literal

from pydantic import BaseModel, Field


class OcrMethodEntry(BaseModel):
    index: int
    method: Literal["embedded", "ocr", "slide_text", "doc_text", "image_ocr", "html"]


class OcrResultOut(BaseModel):
    filename: str
    source_type: Literal["pdf", "pptx", "docx", "image", "html", "url_file"]
    text: str
    char_count: int
    pages_or_slides: int
    method_per_page: list[OcrMethodEntry] = Field(default_factory=list)
    truncated: bool = False


class OcrUrlRequest(BaseModel):
    url: str


class OcrHealthOut(BaseModel):
    status: str = "ok"
    tesseract: bool = False
