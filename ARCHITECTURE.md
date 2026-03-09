# Neoverse — Architecture Diagram

AI-driven hiring platform: multi-tenant interviews, rounds (aptitude, coding, AI voice, live Jitsi), verification, proctoring, and AI reports.

---

## 1. High-level system architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client (Next.js 14)"]
        Web["Browser"]
        Next["Next.js App Router"]
        Web --> Next
    end

    subgraph API["⚙️ Backend (FastAPI)"]
        CORS["CORS Middleware"]
        Auth["Auth Router\nJWT"]
        Admin["Admin Router"]
        Company["Company Router"]
        Candidate["Candidate Router"]
        Proctoring["Proctoring Router"]
        CORS --> Auth
        Auth --> Admin
        Auth --> Company
        Auth --> Candidate
        Auth --> Proctoring
    end

    subgraph Data["💾 Data & external services"]
        PG[("PostgreSQL")]
        Claude["Anthropic Claude API\n(reports, questions, plagiarism,\nvision, HR/Tech AI)"]
        Jitsi["Jitsi / JaaS\n(live interviews)"]
    end

    Next <-->|REST + JWT| API
    API <-->|SQLAlchemy| PG
    API <-->|HTTP| Claude
    API <-->|JWT for meeting| Jitsi
```

---

## 2. User roles and entry points

```mermaid
flowchart LR
    subgraph Roles["Roles"]
        A[Admin]
        C[Company]
        Cand[Candidate]
    end

    subgraph AdminFlow["Admin"]
        A --> Companies["Companies CRUD"]
        A --> Bulk["Bulk company create"]
    end

    subgraph CompanyFlow["Company"]
        C --> Interviews["Interviews & Rounds"]
        C --> Questions["Questions (AI / manual / file)"]
        C --> Enroll["Enroll candidates"]
        C --> Analytics["Analytics & rankings"]
        C --> Reports["Candidate reports PDF"]
        C --> Live["Start live Jitsi"]
        C --> Plagiarism["Plagiarism check"]
    end

    subgraph CandidateFlow["Candidate"]
        Cand --> Verify["Verification\n(ID, photo, resume)"]
        Cand --> Rounds["Take rounds\n(aptitude, coding, voice, live)"]
        Cand --> Proctor["Proctoring\n(fullscreen, tab, face)"]
    end

    Roles --> AdminFlow
    Roles --> CompanyFlow
    Roles --> CandidateFlow
```

---

## 3. Backend layer view

```mermaid
flowchart TB
    subgraph Routers["Routers (HTTP)"]
        auth["auth"]
        admin["admin"]
        company["company"]
        candidate["candidate"]
        proctoring["proctoring"]
    end

    subgraph Services["Services (business logic)"]
        qgen["question_generator"]
        grading["grading_service"]
        code_exec["code_execution"]
        plagiarism["plagiarism"]
        tech_ai["tech_interview"]
        hr_ai["hr_interview"]
        resume["resume_extractor"]
        vision["claude_vision"]
        jitsi["jitsi_jwt_service"]
        interview_ai["interview_ai_service"]
        gd["gd_moderator"]
    end

    subgraph Persistence["Persistence"]
        DB[("PostgreSQL")]
        get_db["get_db()"]
        get_db --> DB
    end

    subgraph Models["Models (SQLAlchemy)"]
        User["User"]
        Company["Company"]
        Candidate["Candidate"]
        Interview["Interview"]
        Round["Round"]
        Question["Question"]
        Response["Response"]
        Verification["Verification"]
        RoundSession["RoundSession"]
        Strike["Strike"]
        ProctoringEvent["ProctoringEvent"]
    end

    Routers --> Services
    Routers --> get_db
    Routers --> Models
    Services --> get_db
    Services --> Models
    Models --> DB
```

---

## 4. Core data model (simplified)

```mermaid
erDiagram
    User ||--o| Company : "company"
    User ||--o| Candidate : "candidate_profile"
    Company ||--o{ Interview : "interviews"
    Company ||--o{ Candidate : "candidates"
    Interview ||--o{ Round : "rounds"
    Interview ||--o{ InterviewCandidate : "candidates"
    Candidate ||--o{ InterviewCandidate : "interviews"
    Round ||--o{ Question : "questions"
    Round ||--o{ RoundSession : "sessions"
    Candidate ||--o| Verification : "verification"
    Candidate ||--o{ Response : "responses"
    Question ||--o{ Response : "responses"
    Candidate ||--o{ Strike : "strikes"
    Candidate ||--o{ ProctoringEvent : "events"

    User { int id string email string role }
    Company { int id string name }
    Candidate { int id int user_id int company_id }
    Interview { int id int company_id string status }
    Round { int id int interview_id string type float weightage }
    Question { int id int round_id string type json test_cases }
    Response { int id int candidate_id int question_id float score json flags }
    Verification { int id int candidate_id string status }
    RoundSession { int id int candidate_id int round_id string status float total_score }
```

---

## 5. Round types and flow

```mermaid
flowchart TB
    subgraph Rounds["Round types"]
        APT["Aptitude (MCQ/quant/tech)"]
        CODING["Coding\n(run code, test cases)"]
        TECH["Tech interview (AI voice)"]
        HR["HR interview (AI voice)"]
        LIVE["Live interview (Jitsi)"]
        GD["Group discussion"]
    end

    subgraph CandidateActions["Candidate actions"]
        Submit["Submit answers"]
        RunCode["Run code"]
        Voice["Voice response\n(Speech API)"]
        JoinMeet["Join Jitsi meeting"]
    end

    subgraph BackendSupport["Backend support"]
        Grading["grading_service"]
        CodeExec["code_execution"]
        TechAI["tech_interview"]
        HRAI["hr_interview"]
        JWT["jitsi_jwt_service"]
        Plag["plagiarism"]
    end

    APT --> Submit --> Grading
    CODING --> RunCode --> CodeExec
    CODING --> Submit --> Grading
    CODING --> Plag
    TECH --> Voice --> TechAI
    HR --> Voice --> HRAI
    LIVE --> JoinMeet --> JWT
```

---

## 6. Frontend app structure (Next.js App Router)

```mermaid
flowchart TB
    subgraph App["app/"]
        layout["layout.tsx"]
        page["page.tsx (landing)"]
        login["login/page.tsx"]
        dashboard["dashboard/"]
        layout --> page
        layout --> login
        layout --> dashboard
    end

    subgraph Dashboard["dashboard/"]
        admin["admin/page.tsx"]
        company["company/page.tsx"]
        candidate["candidate/page.tsx"]
        company_id["company/interviews/[id]/page.tsx"]
        company_rounds["company/.../rounds/[roundId]/page.tsx"]
        company_live["company/.../live/page.tsx"]
        candidate_verify["candidate/verification/page.tsx"]
        candidate_round["candidate/interviews/[id]/rounds/[roundId]/page.tsx"]
    end

    subgraph Lib["lib/"]
        api["api.ts (axios + JWT)"]
    end

    dashboard --> admin
    dashboard --> company
    dashboard --> candidate
    company --> company_id
    company_id --> company_rounds
    company_id --> company_live
    candidate --> candidate_verify
    candidate --> candidate_round
    App --> Lib
```

---

## 7. Request flow (example: candidate takes coding round)

```mermaid
sequenceDiagram
    participant Browser
    participant Next
    participant FastAPI
    participant DB
    participant CodeExec
    participant Grading
    participant Claude

    Browser->>Next: Load round & questions
    Next->>FastAPI: GET /candidate/rounds/:id, questions
    FastAPI->>DB: Round, Questions (test_cases)
    DB-->>FastAPI: data
    FastAPI-->>Next: JSON
    Next-->>Browser: Render

    Browser->>Next: Run code
    Next->>FastAPI: POST /candidate/run-code (question_id, code)
    FastAPI->>CodeExec: run_code_against_tests
    CodeExec-->>FastAPI: results
    FastAPI-->>Next: passed/failed

    Browser->>Next: Submit round
    Next->>FastAPI: POST /candidate/submit
    FastAPI->>Grading: grade_coding (test cases)
    FastAPI->>Claude: plagiarism check (optional)
    FastAPI->>DB: Response, RoundSession
    FastAPI-->>Next: total_score
```

---

## How to view the diagrams

- **In VS Code / Cursor**: Install "Markdown Preview Mermaid Support" and open this file in preview.
- **On GitHub**: Push this file; GitHub renders Mermaid in `.md` files.
- **Export to image**: Use [Mermaid Live Editor](https://mermaid.live/) or `npm run build` with a Mermaid-to-PNG plugin if needed.
