# Product Requirements Document (PRD)
# AI-Driven Hiring Software Platform

**Version:** 1.0  
**Last Updated:** February 19, 2025  
**Document Owner:** Product Team  
**Status:** Draft  

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Implementation Ownership: User vs Agent](#3-implementation-ownership-user-vs-agent)
4. [Goals & Objectives](#4-goals--objectives)
5. [User Personas](#5-user-personas)
6. [User Stories & Functional Requirements](#6-user-stories--functional-requirements)
7. [Round Types & Configurations](#7-round-types--configurations)
8. [AI & Evaluation System](#8-ai--evaluation-system)
9. [Malpractice & Integrity](#9-malpractice--integrity)
10. [Data Model & Architecture](#10-data-model--architecture)
11. [User Flows](#11-user-flows)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Success Metrics](#13-success-metrics)
14. [Out of Scope](#14-out-of-scope)
15. [Appendix](#15-appendix)

---

## 1. Executive Summary

This document outlines the complete product requirements for an **end-to-end AI-driven hiring software platform**. The platform automates the entire hiring pipeline from initial aptitude assessment through final HR evaluation, with AI handling question generation, candidate evaluation, interview conduction, and scoring—while maintaining rigorous anti-malpractice and plagiarism detection.

**Key Value Propositions:**
- **0–100% AI-driven pipeline** — From aptitude to HR rounds
- **Multi-tenant architecture** — Admin → Companies → Candidates hierarchy
- **Flexible round configuration** — 7 round types with customizable parameters
- **Proctoring & integrity** — Face detection, voice detection, plagiarism checks
- **Human-in-the-loop option** — Optional live video rounds with AI-assisted interviewing

---

## 2. Problem Statement

Traditional hiring processes are:
- **Time-consuming** — Manual screening, scheduling, and evaluation
- **Inconsistent** — Varying interviewer quality and bias
- **Difficult to scale** — Limited bandwidth for bulk hiring
- **Prone to malpractice** — Remote interviews lack proper proctoring
- **Fragmented** — Multiple tools for different stages

**Our Solution:** A unified, AI-driven platform that handles the entire hiring lifecycle with automated question generation, evaluation, and proctoring—while giving companies full visibility and control.

---

## 3. Implementation Ownership: User vs Agent

| Component | User Provides | Agent Implements |
|-----------|---------------|------------------|
| **LLM** | API key only | All tuning: prompts, temperature, model params, system prompts |
| **Plagiarism detection** | Nothing | Full implementation: API selection, integration, thresholds |
| **Malpractice/proctoring** | Nothing | Face detection, voice detection, tab-lock, object detection, strike system |
| **TTS/STT** | Nothing (or API key if required) | Integration, tuning, fallbacks |
| **Code execution** | Nothing | Sandbox, security, language support |

---

## 4. Goals & Objectives

| Goal | Objective | Success Criteria |
|------|-----------|------------------|
| **Automation** | AI handles end-to-end hiring pipeline | 90%+ of evaluations automated |
| **Integrity** | Ensure fair, malpractice-free assessments | <5% undetected malpractice |
| **Scalability** | Support bulk onboarding and parallel interviews | Handle 1000+ candidates per company |
| **Flexibility** | Allow companies to customize rounds per interview | All 7 round types configurable |
| **User Experience** | Pleasant, calming interface for all user types | NPS > 50 for candidates |
| **Visibility** | Full transparency for admin and companies | Real-time dashboards and reports |

---

## 5. User Personas

### 5.1 Admin User
- **Who:** Platform administrators, super-users
- **Access:** Full system visibility, user management
- **Capabilities:** Add companies, view all interviews, performance analytics
- **First user in system:** Admin accounts exist at bootstrap; no self-registration for admins

### 5.2 Company / Hirer
- **Who:** HR teams, hiring managers, recruiters
- **Access:** Company-scoped data only
- **Capabilities:** Add candidates, create interviews, configure rounds, review responses, view performance

### 5.3 Candidate
- **Who:** Job applicants
- **Access:** Only interviews they are enrolled in
- **Capabilities:** Complete identity verification, update resume, take rounds, view own progress
- **Account creation:** Created by company (single or bulk); cannot self-register

---

## 6. User Stories & Functional Requirements

### 6.1 Landing & Authentication

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| AUTH-001 | As any user, I want an attractive landing page that feels AI-driven and calming | Page has modern, tech-forward design; calming colors/animations; clear value prop | P0 |
| AUTH-002 | As any user, I want a single login card for all user types | One login form; system routes to correct dashboard based on role | P0 |
| AUTH-003 | As admin, I can login with pre-configured credentials | Admin is first user; no admin self-registration | P0 |
| AUTH-004 | As admin/company/candidate, I experience a relaxing, pleasant UI | Consistent theme across dashboards; no overwhelming/cluttered design | P1 |

### 6.2 Admin Onboarding & Management

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| ADM-001 | As admin, I can add a single company | Form: company name, admin email, credentials; company account created | P0 |
| ADM-002 | As admin, I can bulk add companies via Excel/CSV | Upload file; parse; validate; create N company accounts; report success/failures | P0 |
| ADM-003 | As admin, I can view all companies | List/grid of companies with key details | P0 |
| ADM-004 | As admin, I can see interview rounds per company | Drill-down: Company → Interviews → Rounds | P0 |
| ADM-005 | As admin, I can see all interviews per company | List of interviews with status, dates | P0 |
| ADM-006 | As admin, I can see candidates in each interview | Interview → Candidates list | P0 |
| ADM-007 | As admin, I can view candidate performance metrics | Scores, rankings, round-wise breakdown | P0 |

### 6.3 Company Onboarding & Management

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| COM-001 | As company, I can add a single candidate | Form: name, email, password (or auto-generate) | P0 |
| COM-002 | As company, I can bulk add candidates via Excel/CSV | Upload file; select column for email, name, password; create accounts; link to interview | P0 |
| COM-003 | As company, I choose which CSV column = password | Input field: "Column number for password" (based on file columns) | P0 |
| COM-004 | As company, I see my company details | Profile, contact info | P1 |
| COM-005 | As company, I see interview history | List of past and upcoming interviews | P0 |
| COM-006 | As company, I see round details per interview | Round type, order, config, status | P0 |
| COM-007 | As company, I see candidates who participated per interview | Enrolled candidates, participation status | P0 |
| COM-008 | As company, I see candidate performance per round | Scores, rankings, filtered/shortlisted counts | P0 |
| COM-009 | As company, I can view responses by Interview→Round→Question→Candidate | Hierarchical navigation | P0 |
| COM-010 | As company, I can view responses by Interview→Candidate→Round→Question | Alternative hierarchical navigation | P0 |

### 6.4 Interview & Round Configuration (Company)

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| INT-001 | As company, I create an interview and upload candidate list | Interview created; candidates linked via CSV/Excel or manual add | P0 |
| INT-002 | As company, I choose rounds for an interview | Select from: General/Quant Aptitude, Technical Aptitude, Mixed Aptitude, Coding, Group Discussion, Technical Interview, HR/General | P0 |
| INT-003 | As company, I can rearrange round order | Drag-and-drop or up/down buttons | P0 |
| INT-004 | As company, I can add multiple rounds of same type | e.g., 2 Coding rounds, 2 Technical Interview rounds | P0 |
| INT-005 | As company, I can filter candidates at end based on overall performance | Option: "Filter by overall score" across all rounds | P0 |

**Round-level configuration (common & specific):** See [Section 7](#7-round-types--configurations).

### 6.5 Question Management (Company)

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| QUS-001 | As company, AI generates questions per round; I can approve/reject | Generated questions shown; approve/reject per question | P0 |
| QUS-002 | As company, I can upload Excel/CSV with questions | Parse file; extract questions (and test cases for coding); add to pool | P0 |
| QUS-003 | As company, I can manage/edit all questions | CRUD on question pool per round/domain | P0 |

### 6.6 Candidate Journey

| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| CAN-001 | As candidate, I login with company-provided email and password | Authentication succeeds; routed to candidate dashboard | P0 |
| CAN-002 | As candidate, I complete identity verification | Upload ID proof (college ID, driving license, Aadhaar, passport, etc.); capture live photo via webcam | P0 |
| CAN-003 | As candidate, I update my resume | Upload resume; OCR extracts data; data used for interview design | P0 |
| CAN-004 | As candidate, I see only rounds after verification | Dashboard shows rounds after ID + resume complete | P0 |
| CAN-005 | As candidate, I see round details before starting | Round type, duration, instructions | P0 |
| CAN-006 | As candidate, I press "Start Interview" to begin | Redirected to round interface; guided flow | P0 |
| CAN-007 | All candidate responses must be stored | DB, text, or markdown files; traceable per question | P0 |
| CAN-008 | As candidate, I cannot see interviews until company adds me | Candidates see only interviews they are enrolled in | P0 |

---

## 7. Round Types & Configurations

### 7.1 Common Configuration (All Rounds)

| Parameter | Description | Applicable Rounds |
|-----------|-------------|-------------------|
| Number of candidates to shortlist | How many to advance to next round | All |
| Timing | Duration (minutes) | All |
| Domains | Subject areas (round-specific) | Aptitude, Coding, Technical, GD |

### 7.2 General/Quant Aptitude

| Parameter | Options/Format |
|-----------|-----------------|
| Number of questions | Integer |
| Difficulty | Easy, Medium, Hard, Expert |
| Domains | Quantitative, Logical, Verbal, etc. |
| Source | AI-generated or CSV/Excel upload |

### 7.3 Technical Aptitude

| Parameter | Options/Format |
|-----------|-----------------|
| Number of questions | Integer |
| Difficulty | Easy, Medium, Hard, Expert |
| Domains | Java, OOP, OS, Computer Networking, Cloud Computing, DevOps, DBMS, etc. |
| Source | AI-generated or CSV/Excel upload |

### 7.4 Mixed Aptitude

| Parameter | Options/Format |
|-----------|-----------------|
| Number of questions | Integer |
| Difficulty | Easy, Medium, Hard, Expert |
| Domains | Combination of above |
| Source | AI-generated or CSV/Excel upload |

### 7.5 Coding Round

| Parameter | Options/Format |
|-----------|-----------------|
| Number of questions | Integer |
| Difficulty | Easy, Medium, Hard, Expert |
| Domains | DSA, Greedy, Memoization, Dynamic Programming, Graphs, Trees, etc. |
| Test cases | Hidden + visible; AI or CSV provides inputs/outputs |
| IDE | Open-source IDE (e.g., Monaco, CodeMirror); LeetCode/Codeforces-like UX |
| Constraints | Time limits, memory limits |
| Source | AI-generated or CSV/Excel upload with test cases |

### 7.6 Group Discussion (GD)

| Parameter | Options/Format |
|-----------|-----------------|
| Batch size | Number of candidates per group |
| Domain | Topic for discussion |
| Timing | Duration |
| Evaluation | Speech→Text; LLM scores 0–10 based on contribution, involvement, knowledge |
| Flow | Multi-end communication thread; instructions shown; candidates discuss |

### 7.7 Technical Interview

| Parameter | Options/Format |
|-----------|-----------------|
| Role(s) | Frontend, Backend, Fullstack, Testing, Cyber, Pentesting, DevOps, AIML, IT Support (multi-select) |
| Ice-breaking | "Hi, how are you?", "Explain your projects", resume-based questions |
| Flow | LLM roleplays interviewer; TTS (question) → STT (candidate) → LLM scores 0–10 per question |
| Total score | Sum of per-question scores (e.g., 5 questions × 10 = 50 max) |
| Fit for role | LLM assesses if candidate fits any selected role based on answers |

### 7.8 General/HR Interview

| Parameter | Options/Format |
|-----------|-----------------|
| Max score | Company-defined (e.g., 10, 50, 100) |
| Flow | LLM converses; TTS → STT → LLM scores |
| Domains | Behavioral, situational, culture fit |

### 7.9 Live Human Interview (Face-to-Face)

| Parameter | Options/Format |
|-----------|-----------------|
| Type | Real-time video call (custom, not Zoom/Meet) |
| Malpractice prevention | Same proctoring (tab lock, face/voice, phone detection) |
| AI assistance | Real-time question suggestions, response evaluation, report to interviewer |
| Purpose | Human interviewer; AI assists only |

---

## 8. AI & Evaluation System

### 8.1 LLM Integration

| Requirement | Details |
|-------------|---------|
| **User provides** | **API key only** — no other LLM configuration exposed to users |
| **Agent handles** | All LLM tuning: prompt engineering, temperature, model parameters, system prompts, response formatting, retry logic — implemented and maintained by the development team |
| Use cases | Question generation, interview conduction, scoring |
| Round coverage | Aptitude (MCQ/descriptive), Coding (problem generation), Technical Interview, GD evaluation, HR Interview |
| Storage | API key in env/secrets; never in code |

### 8.2 Aptitude Rounds

- **Question generation:** LLM generates based on domain, difficulty, count
- **Company approval:** Approve/reject before use
- **Evaluation:** Auto-grade (MCQ) or LLM-grade (descriptive)
- **Storage:** Questions in DB; responses linked to candidate + question

### 8.3 Coding Rounds

- **Question generation:** LLM generates problem + test cases (hidden + visible)
- **IDE:** Integrated open-source IDE
- **Execution:** Run code against test cases; pass/fail; scoring
- **Plagiarism:** AI-based code similarity check; AI-generated code detection

### 8.4 Technical Interview

- **Flow:** LLM asks question → TTS plays → Candidate speaks → STT converts → Text sent to LLM → LLM scores 0–10
- **Scoring:** Per-question score; total = sum
- **Role fit:** LLM evaluates alignment with selected roles

### 8.5 Group Discussion

- **Flow:** N candidates in thread; instructions; discussion starts
- **Capture:** Speech→Text for each candidate
- **Scoring:** LLM scores 0–10 per candidate on contribution, involvement, knowledge

### 8.6 HR/General Interview

- **Flow:** Same as Technical (TTS→STT→LLM)
- **Scoring:** Company-defined max; LLM allocates score

### 8.7 Plagiarism & AI-Generated Content Detection

- **Scope:** Code (coding round), text responses (interviews)
- **Implementation ownership:** **Agent-only** — fully implemented by the development team; no user configuration
- **Method:** Third-party APIs or open-source models (agent selects and integrates)
- **Action:** Flag for review; contribute to malpractice score

---

## 9. Malpractice & Integrity

> **Implementation ownership:** All malpractice and proctoring features are **agent-implemented only**. The development team designs, builds, and maintains face detection, voice detection, tab-lock, object detection (phone, multi-person), and strike logic. No user configuration for these components.

### 9.1 Tab/Window Lock

| Requirement | Details |
|-------------|---------|
| Behavior | Candidate cannot exit interview screen/tab |
| Implementation | Fullscreen lock, visibility API, focus detection |
| Warning | 3 strikes (including tab switch) → disqualification |

### 9.2 Face Detection Model

| Requirement | Details |
|-------------|---------|
| Purpose | Verify candidate presence; detect phones, other people |
| Running | Background throughout interview |
| Output | Warnings; count toward 3-strike rule |

### 9.3 Voice/Speech Detection Model

| Requirement | Details |
|-------------|---------|
| Purpose | Detect external voices (e.g., someone helping) |
| Running | Background throughout interview |
| Output | Warnings; count toward 3-strike rule |

### 9.4 Phone & Multi-Person Detection

| Requirement | Details |
|-------------|---------|
| Purpose | Detect phone in frame, multiple faces |
| Model | Video analysis (object detection, face count) |
| Output | Contributes to malpractice score |

### 9.5 Strike System

| Strike | Action |
|--------|--------|
| 1 | Warning shown |
| 2 | Second warning; log |
| 3 | Disqualification; interview ended; company notified |

**Strike triggers:** Tab switch, face not detected, phone detected, multiple people, external voice, plagiarism/AI-generated content.

---

## 10. Data Model & Architecture

### 10.1 Entity Relationships

```
Admin (1) ── manages ──> Company (N)
Company (1) ── owns ──> Interview (N)
Interview (1) ── has ──> Round (N)
Interview (1) ── enrolls ──> Candidate (N)
Round (1) ── has ──> Question (N)
Round (1) ── evaluated_by ──> Response (N) ── by ──> Candidate (1)
```

### 10.2 Key Entities

| Entity | Key Fields |
|--------|------------|
| **Admin** | id, email, password_hash, created_at |
| **Company** | id, name, admin_email, password_hash, created_at |
| **Candidate** | id, email, name, password_hash, company_id, interview_id(s), created_at |
| **Interview** | id, company_id, name, status, created_at |
| **Round** | id, interview_id, type, order, config (JSON), status |
| **Question** | id, round_id, content, type, difficulty, domain, test_cases (for coding) |
| **Response** | id, candidate_id, question_id, content, score, timestamp, file_ref |
| **Verification** | id, candidate_id, id_proof_url, photo_url, resume_url, ocr_data, status |

### 10.3 Bulk Import Schema (CSV/Excel)

**Company import:** `name, admin_email, password` (or similar)  
**Candidate import:** Columns for `email`, `name`, and user-selected `password` column index.

---

## 11. User Flows

### 11.1 Admin Flow

1. Login → Admin Dashboard  
2. Add Company (single or bulk CSV)  
3. View Companies → Select Company → View Interviews → Rounds → Candidates → Performance  

### 11.2 Company Flow

1. Login → Company Dashboard  
2. Create Interview → Upload Candidates (CSV/Excel, map columns) → Add Rounds (configure each)  
3. For each round: Approve AI questions or upload CSV questions  
4. Monitor: Interview → Round → Question → Candidate responses  
5. Alternative: Interview → Candidate → Round → Question  

### 11.3 Candidate Flow

1. Login (email + password from company)  
2. Identity verification: Upload ID → Capture photo  
3. Upload resume (OCR extracts data)  
4. Dashboard: See enrolled rounds  
5. Start Round → Complete round (guided by AI)  
6. All responses stored  

---

## 12. Non-Functional Requirements

### 12.1 Performance

- Page load < 3s  
- Round start < 5s  
- Real-time proctoring latency < 2s  
- Support 100+ concurrent candidates per company  

### 12.2 Security

- Passwords hashed (bcrypt/argon2)  
- API keys in env/secrets  
- HTTPS everywhere  
- Session management with timeout  

### 12.3 Scalability

- Horizontal scaling for API and workers  
- Async jobs for heavy tasks (OCR, plagiarism, LLM)  

### 12.4 Compliance

- GDPR/CCPA considerations for candidate data  
- Audit logs for admin/company actions  

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| Time to hire (vs. manual) | 50% reduction |
| Malpractice detection rate | >95% |
| Candidate completion rate | >85% |
| Company NPS | >40 |
| System uptime | >99.5% |

---

## 14. Out of Scope (V1)

- Self-registration for candidates  
- Self-registration for companies (admin adds only)  
- Mobile native apps (web-first)  
- Offline mode  
- Multi-language support (English first)  

---

## 15. Appendix

### A. ID Proof Types (Suggested)

- College/University ID  
- Driving License  
- Aadhaar Card (masked)  
- Passport  
- Voter ID  

### B. Resume OCR Fields (Suggested)

- Name, Email, Phone  
- Education  
- Experience  
- Skills  
- Projects  

### C. Round Type Reference

| Type | Code |
|------|------|
| General/Quant Aptitude | APT_QUANT |
| Technical Aptitude | APT_TECH |
| Mixed Aptitude | APT_MIXED |
| Coding | CODING |
| Group Discussion | GD |
| Technical Interview | TECH_INTERVIEW |
| HR/General Interview | HR_INTERVIEW |
| Live Human Interview | LIVE_INTERVIEW |
