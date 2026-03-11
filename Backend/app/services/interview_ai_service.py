"""AI helpers for live human interviews."""

from __future__ import annotations

import json

from app.core.config import get_settings


async def live_interview_assist(
    conversation_notes: list[str],
    latest_note: str,
    config: dict,
) -> dict:
    settings = get_settings()
    api_key = (settings.claude_api_key or "").strip()
    if not api_key:
        return {
            "evaluation": "AI assist unavailable because CLAUDE_API_KEY is not configured.",
            "evaluation_rating": "neutral",
            "suggested_questions": [],
            "tip": "",
        }

    import anthropic

    prompt = f"""You are assisting a human interviewer during a live interview.

Role: {config.get("role", "Software Engineer")}
Difficulty: {config.get("difficulty", "medium")}
Domains: {", ".join(config.get("domains", [])) if isinstance(config.get("domains"), list) else config.get("domains", "General")}

Previous notes:
{json.dumps(conversation_notes[-8:], indent=2)}

Latest interviewer note:
{latest_note}

Reply with JSON only:
{{
  "evaluation": "brief evaluation of the candidate's latest answer",
  "evaluation_rating": "correct|partial|incorrect|neutral",
  "suggested_questions": ["follow-up 1", "follow-up 2"],
  "tip": "short actionable interviewer tip"
}}"""

    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=500,
        system="You are an interview copilot. Return valid JSON only.",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )
    raw = response.content[0].text.strip() if response.content else "{}"
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "evaluation": raw,
            "evaluation_rating": "neutral",
            "suggested_questions": [],
            "tip": "",
        }
