"""
AI moderator for Group Discussion (GD) sessions.

Uses Claude to moderate discussions, generate topics, manage turns,
and score participants based on their contributions.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def generate_gd_topic(domain: str | None = None) -> str:
    settings = get_settings()
    if not settings.claude_api_key:
        return "Should AI replace human decision-making in critical domains?"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        prompt = "Generate a single thought-provoking group discussion topic"
        if domain:
            prompt += f" related to {domain}"
        prompt += ". Return only the topic text, nothing else."

        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip().strip('"')
    except Exception as exc:
        logger.exception("Topic generation failed: %s", exc)
        return "The impact of artificial intelligence on modern employment"


def moderate_gd_turn(
    topic: str,
    messages: list[dict[str, Any]],
    participant_names: list[str],
    turn_number: int,
    total_turns: int,
) -> dict[str, Any]:
    """
    Generate an AI moderator response for a GD turn.
    Returns dict with 'message' and optionally 'direction' for guiding discussion.
    """
    settings = get_settings()
    if not settings.claude_api_key:
        return {"message": "Please continue the discussion.", "direction": None}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)

        recent = messages[-10:] if len(messages) > 10 else messages
        conversation_text = "\n".join(
            f"{m.get('speaker', 'Unknown')}: {m.get('text', '')}" for m in recent
        )

        phase = "opening" if turn_number < 3 else ("closing" if turn_number >= total_turns - 2 else "middle")

        prompt = (
            f"You are moderating a group discussion on: '{topic}'\n"
            f"Participants: {', '.join(participant_names)}\n"
            f"Turn {turn_number}/{total_turns} (phase: {phase})\n\n"
            f"Recent discussion:\n{conversation_text}\n\n"
            "As moderator, provide a brief response that:\n"
            "- Acknowledges the last point made\n"
            "- Guides the discussion forward or to a quiet participant\n"
            "- Keeps it balanced and on-topic\n"
            "Return JSON: {\"message\": \"...\", \"direction\": \"...or null\"}"
        )

        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)
    except Exception as exc:
        logger.exception("GD moderation failed: %s", exc)
        return {"message": "Let's hear from another participant.", "direction": None}


def score_gd_participants(
    topic: str,
    messages: list[dict[str, Any]],
    participant_names: list[str],
) -> dict[str, dict[str, Any]]:
    """Score each participant's GD contribution. Returns {name: {score, feedback}}."""
    settings = get_settings()
    if not settings.claude_api_key:
        return {name: {"score": 5.0, "feedback": "Scoring unavailable"} for name in participant_names}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)

        conversation_text = "\n".join(
            f"{m.get('speaker', 'Unknown')}: {m.get('text', '')}" for m in messages
        )

        prompt = (
            f"Score each participant in this group discussion on '{topic}'.\n\n"
            f"Discussion:\n{conversation_text}\n\n"
            f"Participants: {', '.join(participant_names)}\n\n"
            "Score each on: communication (0-10), content quality (0-10), "
            "leadership (0-10), teamwork (0-10).\n"
            "Return JSON: {{\"participant_name\": {{\"score\": overall_0_10, "
            "\"communication\": n, \"content\": n, \"leadership\": n, \"teamwork\": n, "
            "\"feedback\": \"...\"}}, ...}}"
        )

        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)
    except Exception as exc:
        logger.exception("GD scoring failed: %s", exc)
        return {name: {"score": 5.0, "feedback": "Scoring failed"} for name in participant_names}
