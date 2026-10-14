from fastapi import APIRouter

from app.schemas.auth import PublicConfigOut
from app.services import settings as settings_service
from app.services import setup as setup_service

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/config", response_model=PublicConfigOut)
async def public_config():
    s = await settings_service.get_settings()
    return PublicConfigOut(
        needs_setup=await setup_service.needs_setup(),
        institution_name=s.get("institution_name") or "",
        current_term=s.get("current_term") or "",
        student_signup_enabled=bool(s.get("student_signup_enabled", True)),
    )
