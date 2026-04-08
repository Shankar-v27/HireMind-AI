"""
Generate interview questions using Claude. Used for AI-generated question flow.
Requires CLAUDE_API_KEY in environment. Uses CLAUDE_MODEL (default: claude-sonnet-4-6).
Generates questions with model answers; for coding, full problem + test cases and hidden test cases.
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import HTTPException

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _normalize_mcq_options(raw_options: object, content: str) -> dict[str, str] | None:
    if isinstance(raw_options, dict):
        return {str(k).strip().upper(): str(v).strip() for k, v in raw_options.items() if str(v).strip()}
    if isinstance(raw_options, list):
        out: dict[str, str] = {}
        labels = ["A", "B", "C", "D", "E", "F"]
        for idx, value in enumerate(raw_options):
            text = str(value).strip()
            if text:
                out[labels[idx]] = text
        return out or None
    matches = list(re.finditer(r"(?:^|\n)\s*([A-D])[\)\].:-]\s*(.+?)(?=(?:\n\s*[A-D][\)\].:-]\s)|$)", content, flags=re.IGNORECASE | re.DOTALL))
    if not matches:
        return None
    return {m.group(1).upper(): m.group(2).strip() for m in matches}


def _extract_correct_answer(answer: str | None) -> str | None:
    if not answer:
        return None
    match = re.match(r"\s*([A-D])\b", answer, flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return answer.strip()


def generate_questions(
    round_type: str,
    count: int,
    difficulty: str | None = None,
    domain: str | None = None,
) -> list[dict]:
    """
    Call Claude to generate `count` questions for the given round type.
    Returns list of dicts with: content, type, difficulty, domain, answer (model answer),
    and for coding: test_cases (public), hidden_test_cases, full problem in content.
    """
    settings = get_settings()
    api_key = (settings.claude_api_key or "").strip()
    if not api_key:
        logger.warning("CLAUDE_API_KEY not set")
        raise HTTPException(
            status_code=503,
            detail="CLAUDE_API_KEY is not set. Add it to backend/.env and restart the server.",
        )
    if count < 1 or count > 50:
        count = min(max(1, count), 50)

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    model = (settings.claude_model or "claude-sonnet-4-6").strip()
    diff = f" Difficulty: {difficulty}." if difficulty else ""
    dom = f" Domain/topic: {domain}." if domain else ""
    prompt = f"""You are an expert hiring assessor. Generate exactly {count} interview questions for round type: {round_type}.{diff}{dom}

Output ONLY a valid JSON array of objects. No markdown, no code block wrapper, no explanation.

For EVERY question object include:
- "content" (string): Full question text. For coding questions this MUST be the COMPLETE problem statement (problem description, constraints, input/output format, examples) — do not truncate.
- "type" (string): "mcq" or "text" or "coding"
- "difficulty" (string or null): "easy" or "medium" or "hard"
- "domain" (string or null): topic area
- "answer" (string): Model answer. For MCQ give the correct option letter and full text (e.g. "A: Correct answer text"). For text give a model short answer. For coding you MUST give the full solution as executable code with proper indentation (e.g. Python/Java/C++). Do not describe the solution in prose; output the actual code only so it can be displayed in a code block.

For "coding" type questions ONLY, also include:
- "test_cases" (array): At least 2–4 public test cases. Each object: "input" (string), "expected" (string). Example: [{{"input": "1\\\\n2", "expected": "3"}}]
- "hidden_test_cases" (array): At least 2–4 hidden test cases. Same structure: "input", "expected". These are used for evaluation only.

For MCQ type, include 4 options in "content" (e.g. A) ... B) ... C) ... D) ...) or in an "options" array.
"""
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=16384,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.NotFoundError as e:
        logger.warning("Claude model not found: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Claude model not found: {model}. Set CLAUDE_MODEL in backend/.env to a valid model (e.g. claude-sonnet-4-6 or claude-sonnet-4-20250514). See docs.anthropic.com for current models.",
        ) from e
    except anthropic.AuthenticationError as e:
        logger.warning("Claude API key invalid: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Invalid CLAUDE_API_KEY. Check your key at console.anthropic.com.",
        ) from e
    except anthropic.APIError as e:
        logger.exception("Claude API error: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Claude API error: {getattr(e, 'message', str(e))}",
        ) from e

    if not msg.content or len(msg.content) == 0:
        logger.warning("Claude returned empty content")
        raise HTTPException(
            status_code=502,
            detail="Claude returned no content. Please try again.",
        )
    text = msg.content[0].text.strip()
    # Strip markdown code block if present (e.g. ```json ... ```)
    if text.startswith("```"):
        lines = text.split("\n")
        start = 1 if lines[0].strip().startswith("```") else 0
        end = len(lines)
        while end > start and lines[end - 1].strip() in ("```", "```json", "```javascript"):
            end -= 1
        text = "\n".join(lines[start:end])
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.exception("Claude response was not valid JSON: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Claude returned invalid JSON. Please try again.",
        ) from e
    if not isinstance(data, list):
        logger.warning("Claude response was not a JSON array: %s", type(data))
        raise HTTPException(
            status_code=502,
            detail="Claude response was not a list of questions. Please try again.",
        )
    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        content = (
            item.get("content") or item.get("question") or item.get("text") or ""
        )
        content = str(content).strip()
        if not content:
            continue
        d = item.get("difficulty")
        dom_val = item.get("domain")
        qtype = str(item.get("type") or item.get("question_type") or "text").strip().lower()[:50]
        answer = item.get("answer") or item.get("model_answer") or item.get("solution")
        answer = str(answer).strip() if answer else None
        entry = {
            "content": content,
            "type": qtype,
            "difficulty": str(d).strip() or None if d is not None else None,
            "domain": str(dom_val).strip() or None if dom_val is not None else None,
        }
        if qtype == "mcq":
            options = _normalize_mcq_options(item.get("options"), content)
            if options:
                entry["options"] = options
            correct_answer = _extract_correct_answer(answer)
            if correct_answer:
                entry["correct_answer"] = correct_answer
        if answer:
            entry["extra_metadata"] = {"model_answer": answer}
        if qtype == "coding":
            public = item.get("test_cases") or item.get("public_test_cases")
            hidden = item.get("hidden_test_cases") or item.get("hidden_tests")
            if isinstance(public, list) or isinstance(hidden, list):
                entry["test_cases"] = {
                    "public": _norm_test_cases(public) if public else [],
                    "hidden": _norm_test_cases(hidden) if hidden else [],
                }
            elif not entry.get("test_cases"):
                entry["test_cases"] = {"public": [], "hidden": []}
        out.append(entry)
    return out[:count]


def _norm_test_cases(cases: list) -> list[dict]:
    """Normalize test case objects to {input, expected}."""
    out = []
    for c in cases if isinstance(cases, list) else []:
        if isinstance(c, dict):
            inp = c.get("input") or c.get("stdin") or ""
            exp = c.get("expected") or c.get("expected_output") or c.get("output") or ""
            out.append({"input": str(inp), "expected": str(exp)})
        elif isinstance(c, (list, tuple)) and len(c) >= 2:
            out.append({"input": str(c[0]), "expected": str(c[1])})
    return out
