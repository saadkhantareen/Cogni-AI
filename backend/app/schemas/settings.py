from typing import Literal

from pydantic import BaseModel

ApprovalPolicy = Literal["all", "major", "none"]


class SettingsOut(BaseModel):
    approval: ApprovalPolicy
    max_upload_mb: int
    ai_threshold_default: int
