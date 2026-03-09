"""
Tech round: voice-only AI interview. Claude generates questions and analyzes candidate
voice responses, returning the next question. Used for TECH_INTERVIEW rounds.
Requires CLAUDE_API_KEY in environment.
"""

from __future__ import annotations

from app.core.config import get_settings


def tech_interview_turn(
    round_type: str,
    conversation: list[dict],
    candidate_response: str,
    is_first: bool,
) -> dict:
    """
    One turn of the tech interview. If is_first, return the first question.
    Else analyze candidate_response and return next_question + analysis.
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
        if is_first or not conversation:
            prompt = f"""You are a professional technical interviewer named Luffy. This is a {round_type} round.
Start naturally with: "Hi, I am Luffy" and then ask the candidate exactly ONE clear technical interview question.
Output format:
QUESTION: <your question here>
Do not include any other text, analysis, or numbering. Just QUESTION: followed by the question."""
            msg = client.messages.create(
                model=settings.claude_model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            text = (msg.content[0].text if msg.content else "").strip()
            if "QUESTION:" in text:
                text = text.split("QUESTION:", 1)[1].strip()
            return {"question": text or "Hi, I am Luffy. Tell me about a technical challenge you solved.", "analysis": "", "done": False}
        # Follow-up: analyze response and ask next question
        history = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')}" for m in conversation[-10:]
        )
        prompt = f"""You are a technical interviewer. Round type: {round_type}.

Conversation so far:
{history}

Candidate's latest response: {candidate_response}

Tasks:
1. In one short sentence, analyze the response (strength/weakness).
2. Either ask exactly ONE follow-up technical question, or if you have enough to evaluate (e.g. 3-4 exchanges), end the interview.

Output format, exactly:
ANALYSIS: <one sentence>
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
            question = "Anything else you'd like to add?"
        return {"question": question, "analysis": analysis, "done": done}
    except Exception:
        return {"question": "", "analysis": "Analysis unavailable.", "done": True}
