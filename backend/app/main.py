from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import lifespan
from app.core.errors import register_exception_handlers
from app.routers import (
    admin,
    attempts,
    auth,
    classes,
    exams,
    materials,
    notifications,
    requests,
)

app = FastAPI(title="Cogni.ai API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(classes.router)
app.include_router(materials.router)
app.include_router(exams.router)
app.include_router(attempts.router)
app.include_router(requests.router)
app.include_router(notifications.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
