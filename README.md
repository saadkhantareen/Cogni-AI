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
  fetch wrapper.
- **DB:** MongoDB.
- **LLM:** provider-agnostic interface (`openai` | `anthropic` | `mock`).

## Running it

```bash
# backend
cd backend
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm run dev

# backend tests
cd backend
pytest
```

See `CLAUDE.md` for conventions and `docs/` for architecture, data model and
API reference.
