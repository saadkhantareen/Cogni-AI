# API

Endpoints are documented here as they're built, one row per route. Every
error response uses the uniform shape `{"detail": "...", "code": "..."}`.

| Method | Path | Role(s) | Request | Response |
|--------|------|---------|---------|----------|
| GET | /api/health | public | — | `{status}` |
| POST | /api/auth/login | public | `{email, password}` | `{access_token, token_type, user{id,name,email,role,dept_id}}`. 401 `UNAUTHORIZED` on wrong email/password (generic message). 403 `FORBIDDEN` if the account is inactive. |
| GET | /api/auth/me | any authenticated user | — (Bearer token) | `{id,name,email,role,dept_id,status}` |
| GET | /api/auth/demo-accounts | public | — | `[{id,name,email,role,dept_name,status}]` — the first 3 users of each role, in insertion order (12 total), for the login page's click-to-sign-in list. Never includes password hashes. |
