"""
HR round: voice-only AI interview. Claude asks on-the-spot questions based on
recruiter requirements and candidate resume; evaluates voice answers very strictly.
No pre-uploaded questions. Used for HR_INTERVIEW rounds. Requires CLAUDE_API_KEY.
"""

from __future__ import annotations

from app.core.config import get_settings


def hr_interview_turn(
    recruiter_requirements: str,
    resume_text: str,
    candidate_name: str,
    conversation: list[dict],
    candidate_response: str,
    is_first: bool,
) -> dict:
    """
    One turn of the HR interview. If is_first, return the first question.
    Else analyze candidate_response strictly and return next_question + analysis.
    Returns: { "question": str, "analysis": str, "done": bool }.
    """
    settings = get_settings()
    if not settings.claude_api_key:
        return {
            "question": "AI is not configured. Please contact the administrator." if is_first else "",
            "analysis": "",
            "done": True,
        }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        req_block = f"Recruiter requirements:\n{recruiter_requirements}\n" if recruiter_requirements.strip() else ""
        resume_block = f"Candidate resume/summary:\n{resume_text}\n" if resume_text.strip() else ""
        context = f"{req_block}{resume_block}Candidate name: {candidate_name}"

        if is_first or not conversation:
            prompt = f"""You are a strict, professional HR interviewer named Luffy.
Start naturally with: "Hi, I am Luffy" and then ask on-the-spot questions only — no pre-prepared list.
Use this context to tailor your questions:

{context}

Rules:
- Ask exactly ONE clear HR interview question (behavioral, situational, or fit). Be strict and professional.
- Base the question on recruiter requirements and the candidate's resume where relevant.
- Output format, nothing else:
QUESTION: <your question here>"""
            msg = client.messages.create(
                model=settings.claude_model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            text = (msg.content[0].text if msg.content else "").strip()
            if "QUESTION:" in text:
                text = text.split("QUESTION:", 1)[1].strip()
            return {"question": text or "Hi, I am Luffy. Tell us about yourself and why you want this role.", "analysis": "", "done": False}

        # Follow-up: evaluate strictly and ask next or end
        history = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')}" for m in conversation[-10:]
        )
        prompt = f"""You are a very strict HR interviewer. Context:

{context}

Conversation so far:
{history}

Candidate's latest response: {candidate_response}

Tasks:
1. Evaluate the response STRICTLY: note gaps, vagueness, or weak answers in one short sentence. Be strict — do not be lenient.
2. Either ask exactly ONE follow-up HR question, or if you have enough to evaluate (e.g. 4–5 exchanges), end the interview.

Output format, exactly:
ANALYSIS: <one strict sentence — strengths or weaknesses>
QUESTION: <next question> OR DONE: yes
If ending, use DONE: yes and no QUESTION line."""
        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = (msg.content[0].text if msg.content else "").strip()
        analysis = ""
        question = ""
        done = False
        for line in text.split("\n"):
            line = line.strip()
            if line.upper().startswith("ANALYSIS:"):
                analysis = line.split(":", 1)[1].strip()
            elif line.upper().startswith("QUESTION:"):
                question = line.split(":", 1)[1].strip()
            elif "DONE:" in line.upper():
                done = True
        if not question and not done:
            question = "Anything else you want to add?"
        return {"question": question, "analysis": analysis, "done": done}
    except Exception:
        return {"question": "", "analysis": "Evaluation unavailable.", "done": True}
