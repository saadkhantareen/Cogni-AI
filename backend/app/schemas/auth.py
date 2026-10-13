from pydantic import BaseModel

from app.schemas.users import Role, UserStatus


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenUser(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    dept_id: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: TokenUser


class DemoAccountOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    dept_name: str | None = None
    status: UserStatus
