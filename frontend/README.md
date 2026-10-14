# Cogni.ai frontend

React 18 + Vite UI for the Cogni.ai exam platform. Layout, class names and
copy match `reference/Cogni.ai-v7.html`. Data comes from the FastAPI backend
under `/api` (proxied in dev). `localStorage` is used only for the auth JWT
and the theme preference.

## Setup

```bash
# from repo root — backend first
cd backend
cp .env.example .env   # if needed
# set MONGO_URI, JWT_SECRET, LLM_PROVIDER=mock
python -m app.seed
uvicorn app.main:app --reload --port 8000

# frontend
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://localhost:8000`.

### Env

Frontend has no secrets. Optional Vite env:

| Variable | Default | Purpose |
|----------|---------|---------|
| (none required) | — | API base is `/api` via the Vite proxy |

Backend env lives in `backend/.env` (see `backend/.env.example`).

### Seed and demo accounts

```bash
cd backend && python -m app.seed
```

All demo passwords are **`demo123`**. Typical accounts (seed may list more):

| Role | Email |
|------|-------|
| Admin | `admin@cogni.pk` |
| HOD | `tariq.mehmood@umt.edu.pk` |
| Teacher | `ayesha.khan@umt.edu.pk` |
| Student | `hamza.ali@umt.edu.pk` |

The login page also loads `/api/auth/demo-accounts` for one-click sign-in.

## Scripts

```bash
npm run dev      # Vite dev server
npm run build    # production build (must pass with no errors)
npm run preview  # serve the build
```

## Demo script (full loop)

Run this in the UI without calling the API by hand. Use the demo switcher in
the top bar to hop roles, or sign out and pick another account.

1. **HOD** (`tariq.mehmood@umt.edu.pk`) — Requests → request a Midterm/Quiz
   from Dr. Ayesha for class **CS-201-A**, with a due date and short note.
2. **Teacher** (`ayesha.khan@umt.edu.pk`) — Home shows the open request →
   Generate a draft (upload/paste material if the class has none) → review
   questions on the paper → Submit for approval (or Publish if approval is
   not required).
3. **HOD** — Approvals → open the paper → Approve (or Return with a comment).
4. **Teacher** — if approved, Publish. Share that the exam is live.
5. **Student** (`hamza.ali@umt.edu.pk`) — My exams → Start → answer → Submit.
   Optionally fill a written answer with the demo helpers to raise an
   AI-writing flag.
6. **Teacher** — Results for that exam → review flags (Clear / Ask to discuss;
   neither changes the grade) → override a score if you want → Release
   results (confirm modal). Threshold slider saves on mouse release.
7. **Student** — Results / Feedback → topic breakdown and study plan.
8. **Admin** (`admin@cogni.pk`) — Settings → Activity log → confirm events
   appear (newest first). Optionally check Users, Departments and Settings.

## Routes (by role)

- **Public:** `/`, `/login`
- **Admin:** `/app/admin`, `/departments`, `/departments/:id/head`, `/users`,
  `/users/new`, `/settings` (`?tab=activity`)
- **HOD:** `/app/hod`, `/requests`, `/approvals`, `/approvals/:id`,
  `/analytics`, `/policy`
- **Teacher:** `/app/teacher`, `/classes`, `/classes/:id`, `/materials`,
  `/exams`, `/exams/new`, `/exams/:id`, `/exams/:id/results`,
  `/attempts/:id`, `/flags`
- **Student:** `/app/student`, `/classes`, `/classes/:id`, `/exams`,
  `/exams/:id/take`, `/attempts/:id/done`, `/results`,
  `/attempts/:id/feedback`, `/study`

## Known limitations

- **English only** — UI and LLM prompts assume English.
- **PDFs must contain real text** — scanned image-only PDFs are rejected (no OCR).
- **AI-writing flag is a heuristic** — advisory only; never auto-penalises.
- **No proctoring** — timed exams, but no webcam / lock-down browser.
- **No real email** — notifications are in-app only; password resets toast
  `demo123` rather than sending mail.
