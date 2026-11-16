# Cogni.ai — Tech Stack, Tools, and Technologies

Document for the project report. It lists what the live Cogni.ai codebase actually uses: languages, frameworks, libraries, AI providers, and deployment tools.

Cogni.ai is an AI-assisted university exam platform with four roles (Admin, HOD, Teacher, Student). A teacher uploads course material, an LLM drafts an exam, the teacher edits and publishes it (with an optional HOD approval gate), a student takes a timed exam, and written answers are graded by the LLM with an advisory AI-writing flag. The teacher releases results.

---

## 1. Stack at a glance

| Layer | Technology |
|-------|------------|
| Language (UI) | JavaScript (JSX). No TypeScript in application code. |
| Frontend | React 19, React DOM 19, React Router v6, Vite 8 |
| Styling | Custom CSS ported from the v7 HTML prototype (no UI kit, no Tailwind) |
| HTTP client | Plain `fetch` wrapper (`frontend/src/api`) |
| Language (API) | Python 3.11+ |
| Backend | FastAPI, Uvicorn, Pydantic v2, Pydantic Settings |
| Database | MongoDB 7 (local Docker) or MongoDB Atlas. Driver: PyMongo async (`AsyncMongoClient`) |
| Auth | JWT (PyJWT) bearer tokens, bcrypt password hashes, role and ownership checks on the server |
| AI | Provider-agnostic LLM client: OpenAI-compatible APIs, Anthropic, Groq, OpenRouter, VyceAI, and a local `mock` provider |
| NLP | spaCy (`en_core_web_sm`), Sentence Transformers (`all-MiniLM-L6-v2`) |
| Documents | pypdf, PyMuPDF, python-docx, python-pptx, Tesseract OCR, Pillow, trafilatura, Beautiful Soup |
| Secrets at rest | `cryptography` (Fernet) for stored API keys |
| Email | SMTP (`smtplib`), e.g. Brevo relay, for password reset |
| Tests | pytest, pytest-asyncio, pytest-cov, Playwright |
| Lint | Ruff (Python), oxlint (frontend) |
| Deploy | Vercel (two projects: `frontend/` and `backend/`), MongoDB Atlas |
| Dev database | Docker image `mongo:7` |
| Source of UI truth | `reference/Cogni.ai-v7.html` (read-only prototype) |

Request path:

```
Browser (React + Vite)
  → /api/*  (Vite proxy in dev, same-origin or CORS in production)
  → FastAPI routers
  → services
  → MongoDB
```

LLM and document tools are called from backend services. The browser never holds the platform LLM key.

---

## 2. Frontend

| Package | Role | Version in repo |
|---------|------|-----------------|
| React | UI | `^19.2.8` |
| react-dom | DOM renderer | `^19.2.8` |
| react-router-dom | Client routes | `^6.30.6` |
| Vite | Dev server and production build | `^8.3.0` |
| @vitejs/plugin-react | JSX transform | `^6.1.1` |
| oxlint | Lint | `^1.81.0` |
| @playwright/test | End-to-end browser tests | `^1.64.1` |

Application state lives in React context and component state. There is no Redux and no component library. CSS files live in `frontend/src/styles/` (`tokens.css`, `base.css`, `components.css`, `landing.css`, `auth.css`, `app.css`).

Public routes: `/`, `/login`, `/setup`. Signed-in routes: `/app/<role>/…` behind a role guard. OCR Studio is at `/ocr`.

Dev server proxies `/api` to `http://localhost:8000` (`frontend/vite.config.js`). Production SPA fallback is a Vercel rewrite to `index.html` (`frontend/vercel.json`).

---

## 3. Backend

| Package | Role |
|---------|------|
| FastAPI | HTTP API, dependency injection, lifespan |
| Uvicorn | ASGI server (`uvicorn[standard]`) |
| Pydantic v2 | Request and response schemas |
| pydantic-settings | Typed settings from environment variables |
| python-dotenv | Local `.env` loading |
| python-multipart | File uploads |
| httpx | Outbound HTTP (LLM and fetches) |
| PyJWT | Sign and verify access tokens |
| bcrypt | Password hashing |
| cryptography | Fernet encryption of stored provider keys |

API prefix is `/api`. JSON keys are `snake_case`. MongoDB `_id` is exposed as string `id`.

Routers validate input and call services. Services own business rules and Mongo queries. Settings live in `backend/app/core/config.py`.

Python tooling: Ruff for lint, pytest for tests. `requires-python` is `>=3.11` (`backend/pyproject.toml`).

---

## 4. Database

| Item | Choice |
|------|--------|
| Engine | MongoDB |
| Local | Docker `mongo:7` on port `27017` (container name `cogni-mongo`) |
| Production | MongoDB Atlas (`mongodb+srv://…`) |
| Driver | PyMongo `>=4.9`, async API (`AsyncMongoClient`), not Motor |
| Connection | `MONGO_URI`, `MONGO_DB` |

Indexes are created on startup. Collections cover users, departments, classes, materials, exams, attempts, notifications, activity log, and related records. There is no SQL database and no ORM.

---

## 5. Artificial intelligence and NLP

### 5.1 LLM interface

`backend/app/services/llm.py` exposes one client interface. `LLM_PROVIDER` selects the implementation. `mock` returns fixed JSON so the app runs with no API key.

Providers wired in the catalog (`backend/app/services/llm_catalog.py`):

| Provider | How it is called | Example models in the catalog |
|----------|------------------|--------------------------------|
| Platform / VyceAI | OpenAI-compatible HTTP | Claude Sonnet 4.6 |
| OpenRouter | `https://openrouter.ai/api/v1` | Free router, NVIDIA Nemotron 3 Ultra, Google Gemma 4 |
| Groq | `https://api.groq.com/openai/v1` | Llama 3.1 8B, Llama 3.3 70B, Gemma 2 9B |
| OpenAI | Official `openai` SDK | Configured by env |
| Anthropic | Official `anthropic` SDK | Configured by env |
| mock | In-process canned JSON | None |

Teachers can bring their own key (BYOK) for exam generation. The platform key stays on the server. Student written answers are delimited and treated as data so instructions inside an answer are ignored.

The model drafts exams (MCQ, short answer, essay) tagged with Bloom level, topic, and course learning outcome. It also grades written answers against a model answer and returns an AI-writing likelihood flag. That flag is advisory. Only a teacher decision changes a grade.

### 5.2 Local NLP (no GPU required)

| Tool | Model / library | Use |
|------|-----------------|-----|
| spaCy | `en_core_web_sm` | Tokenization, lemmatization, stopword removal, sentence split on uploaded material. Regex fallback if the model is missing. |
| Sentence Transformers | `all-MiniLM-L6-v2` (local) | Embeddings for semantic chunking and grading support. Token-overlap fallback if the model cannot load. |
| trafilatura | `>=2.3` | Clean text extraction from public web pages |
| Beautiful Soup 4 | `beautifulsoup4` | HTML parsing alongside URL fetch |

---

## 6. Documents, PDF, and OCR

| Tool | Use |
|------|-----|
| pypdf | PDF text extraction |
| PyMuPDF (`pymupdf`) | PDF page render, embedded images, formal exam PDF output |
| python-docx | DOCX paragraphs and tables |
| python-pptx | PPTX slide text and pictures |
| Tesseract OCR + pytesseract | CPU OCR for scans, slide pictures, and embedded images. System package `tesseract` plus `tesseract-data-eng`. |
| Pillow | Image decode before OCR |
| ReportLab | Optional richer PDF fixtures in tests (`reportlab>=4.0`) |
| LibreOffice (`soffice`) | Manual conversion hint only for legacy `.ppt` / `.doc`. Those formats are not read directly. |

Supported upload kinds: PDF, DOCX, PPTX, pasted text, and public URL. Original PDF/DOCX/PPTX bytes are stored on Cloudinary (`resource_type=raw`) when `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are set; otherwise Mongo GridFS is used for local/tests. Extracted text stays in Mongo for exams and the study assistant. Opening a material returns the original file with its real extension (Classroom-style). OCR Studio (`/ocr`, `POST /api/ocr/file`, `POST /api/ocr/url`) is stateless and does not call an external OCR API.

---

## 7. Security and email

| Concern | Technology |
|---------|------------|
| Passwords | bcrypt |
| Sessions | JWT bearer, expiry from `JWT_EXPIRE_MIN` |
| Authorization | Server-side role (`admin`, `hod`, `teacher`, `student`) and ownership checks |
| Stored LLM keys | Fernet (`cryptography`) |
| Password reset mail | SMTP with STARTTLS (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`). Example relay: Brevo `smtp-relay.brevo.com:587`. |
| Production guards | App refuses a weak `JWT_SECRET`, `LLM_PROVIDER=mock`, CORS `*`, and throwaway database names |

---

## 8. Testing, quality, and developer tools

| Tool | Where |
|------|--------|
| pytest, pytest-asyncio | Backend unit and API tests |
| pytest-cov, pytest-randomly, freezegun | Coverage, order randomization, frozen time |
| httpx, anyio | Async test client |
| Playwright | Frontend end-to-end (`npm run test:e2e`), including a mobile spec |
| Ruff | Python lint |
| oxlint | Frontend lint |
| mongodb-memory-server | Optional in-memory Mongo for tests (declared in frontend `allowScripts`) |

Commands:

```bash
cd backend && pytest
cd frontend && npm run build
cd frontend && CI=1 npm run test:e2e
```

---

## 9. Deployment and hosting

| Piece | Host |
|-------|------|
| Frontend | Vercel project, root directory `frontend`. SPA rewrite in `frontend/vercel.json`. |
| Backend | Vercel project, root directory `backend`, framework FastAPI, entry `main:app`. Function max duration 300s (`backend/vercel.json`). |
| Database | MongoDB Atlas |
| Env | `APP_ENV`, `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, `LLM_*`, `CORS_ORIGINS`, SMTP, lockout settings. Secrets stay in `.env` (gitignored) and the host’s env UI. `.env.example` holds placeholders only. |

Local run:

```bash
docker start cogni-mongo || docker run -d --name cogni-mongo --ulimit nofile=65536:65536 -p 27017:27017 mongo:7
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

UI: `http://localhost:5173`. API: `http://localhost:8000`.

---

## 10. Repository layout (tools map onto these folders)

```
backend/app/core/        config, db, security
backend/app/routers/     HTTP routes
backend/app/schemas/     Pydantic models
backend/app/services/    business logic, LLM, OCR, NLP, PDF, mail
frontend/src/api/        fetch wrapper
frontend/src/auth/       token and role guard
frontend/src/pages/      admin, hod, teacher, student, public
frontend/src/styles/     CSS from the v7 prototype
reference/               read-only v7 HTML prototype
docs/                    architecture, API, data model
```

---

## 11. Cursor project prompt (stack rules used to build the app)

This is the stack section from the Cursor project rules (`CLAUDE.md`). The implemented app above is the same architecture, with the libraries that were added as features landed (OCR, spaCy, embeddings, extra LLM gateways, Vercel).

```
Stack (fixed, do not substitute)

- Backend: Python 3.11+, FastAPI, Pydantic v2, PyMongo async API
  (AsyncMongoClient, not Motor), PyJWT, bcrypt, pypdf, httpx,
  pytest + pytest-asyncio, python-dotenv/pydantic-settings, ruff.
- Frontend: React 18, Vite, JavaScript (JSX, no TypeScript),
  React Router v6, plain fetch wrapper. No UI library, no Tailwind,
  no Redux. Styling is the CSS lifted from the v7 file.
- DB: MongoDB (Atlas or local).
- LLM: provider-agnostic interface in backend/app/services/llm.py,
  selected by env LLM_PROVIDER = openai | anthropic | mock. mock
  returns deterministic canned JSON so the app runs with no key and no cost.

Rules

- v7 HTML is read-only reference. Never edit anything in reference/.
- Never hardcode secrets. Only .env (gitignored) and .env.example with
  placeholder values.
- All API routes are under /api. All JSON keys are snake_case. Mongo _id
  is exposed as string id.
- Roles: admin, hod, teacher, student. Every non-public route enforces role
  and ownership server-side.
- The AI never changes a grade by itself. AI-writing flags are advisory only;
  only a teacher decision changes anything.
- Written-answer text from students is untrusted: it must be delimited and
  the model told to ignore any instructions inside it.
```

Note for the report: the original prompt specified React 18. The installed frontend is React 19 (`react` and `react-dom` `^19.2.8`) on the same Vite + JSX + React Router setup. LLM access also includes OpenRouter, Groq, and VyceAI in addition to OpenAI, Anthropic, and mock.

---

## 12. Short paragraph (paste into the report)

Cogni.ai is a web application. The client is a React 19 single-page app built with Vite and React Router, styled with custom CSS and talking to the server through a small fetch wrapper. The server is a Python 3.11 FastAPI application using Pydantic for validation, PyMongo’s async client for MongoDB, PyJWT and bcrypt for authentication, and Fernet for encrypting stored model keys. Exam drafting and written-answer grading go through a provider-agnostic LLM layer (OpenAI-compatible endpoints, Anthropic, Groq, OpenRouter, VyceAI, or a local mock). Course files are read with pypdf, PyMuPDF, python-docx, and python-pptx; scanned pages use local Tesseract OCR. Text is cleaned with spaCy and embedded with Sentence Transformers (`all-MiniLM-L6-v2`). Password-reset email uses SMTP. Automated checks use pytest and Playwright. Production hosting is two Vercel projects plus MongoDB Atlas.
