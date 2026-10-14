from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.db import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.ratelimit import check_login_rate_limit
from app.core.security import create_token
from app.schemas.auth import DemoAccountOut, LoginRequest, LoginResponse, TokenUser
from app.schemas.users import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    check_login_rate_limit(request)
    try:
        user = await auth_service.authenticate(payload.email, payload.password)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    token = create_token(str(user["_id"]), user["role"])
    return LoginResponse(
        access_token=token,
        user=TokenUser(
            id=str(user["_id"]),
            name=user["name"],
            email=user["email"],
            role=user["role"],
            dept_id=user.get("dept_id"),
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(current: CurrentUser = Depends(get_current_user)):
    return UserOut(
        id=current.id,
        name=current.name,
        email=current.email,
        role=current.role,
        dept_id=current.dept_id,
        status=current.status,
    )


@router.get("/demo-accounts", response_model=list[DemoAccountOut])
async def demo_accounts():
    db = get_db()
    depts = {str(d["_id"]): d["name"] async for d in db.departments.find()}
    users = await auth_service.list_demo_accounts()
    return [
        DemoAccountOut(
            id=str(u["_id"]),
            name=u["name"],
            email=u["email"],
            role=u["role"],
            dept_name=depts.get(u.get("dept_id")),
            status=u["status"],
        )
        for u in users
    ]
