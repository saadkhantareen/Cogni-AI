# Architecture

## Request flow

Browser (React, Vite dev server) -> `/api/*` (proxied in dev to
`http://localhost:8000`) -> FastAPI app -> routers -> services -> MongoDB
(PyMongo async client). Auth is a bearer JWT issued on login, decoded by a
dependency on every non-public route; the dependency attaches the current
user (id, role, dept_id) to the request so routers can enforce role and
ownership checks before touching the database.

## Folder responsibilities

**backend/app/**
- `main.py` — FastAPI app instance, CORS, router registration, `/api/health`.
- `core/config.py` — typed settings loaded from env (Mongo URI/DB, JWT
  secret/expiry, LLM provider/model/key, CORS origins, max upload size).
- `core/db.py` — async Mongo client lifecycle (connect on startup, close on
  shutdown via FastAPI lifespan) and index creation.
- `core/security.py` — password hashing (bcrypt) and JWT issue/verify.
- `routers/` — one module per resource (auth, users, departments, classes,
  materials, exams, attempts, requests, notifications, admin). Routers only
  validate input, call services, and shape output.
- `schemas/` — Pydantic v2 request/response models, one module per resource,
  mirroring `docs/DATA_MODEL.md`.
- `services/` — business logic and Mongo queries (one module per resource),
  plus `services/llm.py` for AI calls. Routers never talk to Mongo directly.
- `seed.py` — populates a fresh database with the same demo users, depts,
  classes and exams as the v7 prototype's `seed()`, for local development.

**frontend/src/**
- `api/` — a thin fetch wrapper (base URL, JSON headers, bearer token
  injection, error unwrapping) plus one module per resource.
- `auth/` — login, token storage, current-user context, route guards per
  role.
- `components/` — shared UI pieces ported from v7 (topbar, sidebar nav,
  modal, toast, bloom/status pills, etc).
- `pages/{admin,hod,teacher,student,public}/` — one component per v7 page
  function (`P['t-dash']`, `P['h-approvals']`, ...), one role folder each,
  plus `public/` for landing and login.
- `styles/` — the CSS lifted from the v7 `<style>` block (ported verbatim in
  a later phase, not this one).
- `utils/` — pure helpers ported from v7 (bloom pill, status pill, grading
  display helpers, date formatting) with no DOM or fetch dependencies.

## Auth

Login issues a JWT (`sub`=user id, `role`, `dept_id`, expiry from
`JWT_EXPIRE_MIN`). The frontend stores it and attaches
`Authorization: Bearer <token>` to every `/api` call. `core/security.py`
decodes and verifies it; a FastAPI dependency wraps that and 401s on
missing/invalid/expired tokens. Role-gated routers additionally depend on a
`require_role(...)` check, and ownership (e.g. a teacher only editing their
own exams, a student only submitting their own attempts) is checked inside
each service function against the decoded user, never trusted from the
request body.

## LLM abstraction

`services/llm.py` defines an abstract `LLMClient` with
`json_complete(system, user, schema_hint) -> dict`. Concrete clients
(`OpenAIClient`, `AnthropicClient`, `MockLLM`) implement it; `MockLLM`
returns deterministic canned JSON shaped like the v7 `POOLS` content so the
app is fully runnable with `LLM_PROVIDER=mock` and no API key. A factory
reads `LLM_PROVIDER` from settings and returns the right client. Student
written-answer text passed to any client is wrapped in explicit delimiters
with an instruction to treat it as data, not instructions, since it is
untrusted input.

## v7 pages -> React routes

Route prefixes follow v7's `ROLE[role].pre` (`a-`, `h-`, `t-`, `s-`) mapped
to `/admin/...`, `/hod/...`, `/teacher/...`, `/student/...`. Each v7
`P['x-y']` page function becomes one React route/component under
`pages/<role>/`, e.g. `P['t-dash']` -> `pages/teacher/Dashboard.jsx` at
`/teacher`, `P['t-exam']` -> `pages/teacher/ExamEditor.jsx` at
`/teacher/exams/:id`, `P['s-take']` -> `pages/student/TakeExam.jsx` at
`/student/exams/:id/take`. Landing and login stay public routes outside the
app shell. This mapping is finalized page-by-page in later phases; this
phase only creates the folders.
