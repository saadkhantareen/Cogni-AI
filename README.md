# Cogni.ai

AI-assisted exam platform for Admin, HOD, Teacher and Student roles.

Teachers upload course material and the LLM drafts an exam (MCQ, short answer,
essay — tagged by Bloom level, topic and course learning outcome). The teacher
edits it, the HOD approves or returns it with a comment (if required by
settings), and the teacher publishes it. Students take a timed exam: MCQs are
auto-graded and written answers are graded by the LLM against a model answer.
Each written answer also gets an AI-writing likelihood flag for the teacher to
review — it never changes a grade automatically. The teacher overrides scores
and releases results; students see topic-by-topic feedback and a study plan.
Every action notifies the relevant other role and is written to an activity
log that Admin can read.

`reference/Cogni.ai-v7.html` is the source of truth for layout, copy, page
list, role navigation and business rules — it's a single-file vanilla JS
prototype with data faked in `localStorage`. This repo replaces that fake data
layer with a real FastAPI + MongoDB backend and re-implements the UI in React,
keeping the look identical.

## Stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, PyMongo async API, PyJWT,
  bcrypt, pypdf, httpx, pytest + pytest-asyncio.
- **Frontend:** React 18, Vite, JavaScript (JSX), React Router v6, plain
  fetch wrapper. No UI library.
- **DB:** MongoDB.
- **LLM:** provider-agnostic interface (`openai` | `anthropic` | `mock`).

## Setup

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
cp .env.example .env   # set MONGO_URI, JWT_SECRET, LLM_PROVIDER=mock
python -m app.seed
uvicorn app.main:app --reload --port 8000

# 2. Frontend (other terminal)
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:8000/api (Vite proxies `/api`)

See `frontend/README.md` and `backend/README.md` for more detail.
`CLAUDE.md` and `docs/` cover architecture, data model and API.

### Env (backend)

Typical `.env` keys (placeholders in `.env.example`):

- `MONGO_URI`, `MONGO_DB`
- `JWT_SECRET`, `JWT_EXPIRE_MIN`
- `LLM_PROVIDER` = `mock` | `openai` | `anthropic`
- `CORS_ORIGINS` (include the Vite origin)

Frontend needs no API keys; auth token and theme live in `localStorage` only.

### Seed

```bash
cd backend && python -m app.seed
```

### Demo accounts

Password for every demo user: **`demo123`**

| Role | Email (typical seed) |
|------|----------------------|
| Admin | `admin@cogni.pk` |
| HOD | `tariq.mehmood@umt.edu.pk` |
| Teacher | `ayesha.khan@umt.edu.pk` |
| Student | `hamza.ali@umt.edu.pk` |

The login page lists demo accounts from `GET /api/auth/demo-accounts`.

## Demo script

Walk the full loop in the browser (no hand-crafted API calls). Use the
portal demo switcher or sign out between roles.

1. **HOD** — Paper requests → request a paper from the CS teacher for
   **CS-201-A**.
2. **Teacher** — Fulfil the request: generate a draft from course material,
   edit questions, submit for HOD approval (when required).
3. **HOD** — Approvals → review → Approve (or Return with comments).
4. **Teacher** — Publish the approved paper.
5. **Student** — Start the live exam, answer, submit.
6. **Teacher** — Results → review AI-writing flags (Clear / Ask to discuss do
   **not** change grades) → optional score override → Release results.
7. **Student** — Open feedback and the study plan.
8. **Admin** — Settings → Activity log (newest first); spot-check Users /
   Departments / Settings.

## Tests

```bash
cd backend && pytest
cd backend && python scripts/e2e_smoke.py   # needs a running server + seed
cd frontend && npm run build
```

## Known limitations

- **English only** — product copy and LLM prompts are English.
- **PDFs must contain real text** — no OCR for scanned PDFs.
- **AI-writing flag is a heuristic** — advisory only; never an automatic
  penalty.
- **No proctoring** — no webcam, lockdown browser, or plagiarism suite.
- **No real email** — in-app notifications only; reset password sets
  `demo123` and notifies in-app.
