from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            body = exc.detail
        else:
            body = {
                "detail": exc.detail,
                "code": STATUS_CODES.get(exc.status_code, "ERROR"),
            }
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        fields = [
            "{}: {}".format(
                ".".join(str(p) for p in err["loc"] if p != "body"), err["msg"]
            )
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=400,
            content={"detail": "; ".join(fields), "code": "VALIDATION_ERROR"},
        )
