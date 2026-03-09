## AI-Driven Hiring Platform — Backend (FastAPI)

This repository contains the backend for an **AI-driven hiring platform** built with **FastAPI + SQLAlchemy + PostgreSQL**, implementing the core multi-tenant hiring flows described in the PRD/CONTEXT documents.

### Tech stack

- **Backend**: FastAPI, Pydantic v2
- **ORM**: SQLAlchemy 2.x
- **DB**: PostgreSQL
- **Auth**: JWT (password grant + bearer tokens)

### Project structure (backend)

- `backend/requirements.txt` — Python dependencies
- `backend/app/core` — config and security (JWT, password hashing)
- `backend/app/db` — SQLAlchemy engine and session
- `backend/app/models` — ORM models (`User`, `Company`, `Candidate`, `Interview`, `Round`, `Question`, `Response`, `Verification`, etc.)
- `backend/app/schemas` — Pydantic schemas for API IO
- `backend/app/routers` — FastAPI routers (`auth`, `admin`, `company`, `candidate`)
- `backend/app/services` — service layer (e.g., `ai` stubs for LLM integration)

### Running the backend

1. **Create virtualenv and install dependencies**

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate  # on PowerShell
pip install -r requirements.txt
```

2. **Configure environment**

Set at least:

```bash
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/ai_hiring"
$env:JWT_SECRET_KEY = "a-strong-secret"
```

Optional (for first admin user at startup):

```bash
$env:ADMIN_EMAIL = "admin@platform.local"
$env:ADMIN_PASSWORD = "admin-change-me"
```

Optional (for Claude Vision face monitoring, face matching, and plagiarism):

```bash
$env:CLAUDE_API_KEY = "your-anthropic-api-key"
```

3. **Start FastAPI**

```bash
uvicorn app.main:app --reload
```

API will be served at `http://localhost:8000` with OpenAPI docs at `/docs`.

### Implemented API slices (Milestone 1)

- **Auth (`/auth`)**
  - `POST /auth/token` — OAuth2 password flow (form-encoded)
  - `POST /auth/login` — JSON login, returns JWT access token
  - `GET /auth/me` — current user (id, email, full_name, role) for dashboard routing

- **Admin (`/admin`)**
  - `POST /admin/companies` — create a company + its login user
  - `GET /admin/companies` — list companies
  - `POST /admin/companies/bulk` — bulk create companies from CSV/Excel (columns: name, admin_email, password)

- **Company (`/company`)**
  - `GET /company/me` — current company profile
  - `POST /company/candidates` — create candidate
  - `GET /company/candidates` — list candidates
  - `POST /company/interviews` — create interview
  - `GET /company/interviews` — list interviews
  - `POST /company/interviews/{id}/rounds` — add round
  - `GET /company/interviews/{id}/rounds` — list rounds
  - `POST /company/interviews/{id}/candidates` — enroll candidates (body: array of candidate IDs)
  - `POST /company/interviews/{id}/candidates/bulk` — bulk enroll from CSV/Excel (query: password_column_index, email_column_index, name_column_index)
  - `POST /company/rounds/{rid}/questions` — add question
  - `GET /company/rounds/{rid}/questions` — list questions
  - `GET /company/interviews/{iid}/rounds/{rid}/responses` — responses by round (Interview→Round→Question→Candidate)
  - `GET /company/interviews/{iid}/candidates/{cid}/responses` — responses by candidate (Interview→Candidate→Round→Question)

- **Candidate (`/candidate`)**
  - `GET /candidate/me` — current candidate profile
  - `GET /candidate/interviews` — list enrolled interviews
  - `GET /candidate/interviews/{id}/rounds` — list rounds
  - `GET /candidate/interviews/{iid}/rounds/{rid}/questions` — get questions for a round (to take it)
  - `POST /candidate/interviews/{iid}/rounds/{rid}/responses` — submit responses
  - `GET /candidate/verification` — get verification status
  - `POST /candidate/verification` — submit identity/resume URLs and OCR data

- **Proctoring (`/proctoring`)**
  - `POST /proctoring/events` — submit event (tab_switch, fullscreen_exit, face_not_visible_10s, external_voice, logout, phone_detected, multiple_faces); 3 strikes = disqualified
  - `GET /proctoring/status` — current strikes and disqualified status
  - `POST /proctoring/analyze-frame` — send webcam frame (base64); Claude Vision returns face_visible, phone_detected, multiple_faces (requires `CLAUDE_API_KEY`)

### Frontend (Next.js 14)

- **Location**: `frontend/`
- **Run**: `npm install && npm run dev` (set `NEXT_PUBLIC_API_URL=http://localhost:8000` if needed)
- **Flows**: Landing → Login (single card) → role-based redirect to Admin / Company / Candidate dashboard. Admin: list/add/bulk companies. Company: interviews, candidates, rounds, questions, enroll (single + bulk), view responses. Candidate: verification, list interviews/rounds, take round (questions + submit responses).

### Next milestones (planned)

- **AI integration**: LLM question generation and scoring in `app/services/ai.py`.
- **Coding rounds**: IDE + sandboxed code execution + plagiarism detection.
- **Proctoring UI**: Tab lock, face/voice/object detection in browser; wire to `/proctoring/events`.
