"""
Automatic grading for different question types.

- MCQ: exact match against correct_answer
- Coding: run code against test cases (public + hidden)
- Text/Descriptive: grade via Claude LLM
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import get_settings
from app.services.code_execution import run_code_against_tests

logger = logging.getLogger(__name__)


def grade_mcq(response_content: str, correct_answer: str, max_score: float = 1.0) -> dict[str, Any]:
    """Grade an MCQ response by comparing to the correct answer."""
    normalised_response = (response_content or "").strip().lower()
    normalised_answer = (correct_answer or "").strip().lower()
    is_correct = normalised_response == normalised_answer
    return {
        "score": max_score if is_correct else 0.0,
        "method": "exact_match",
        "details": {"correct": is_correct, "expected": correct_answer},
    }


def grade_coding(
    source_code: str,
    language: str,
    test_cases_json: dict | None,
    max_score: float = 1.0,
) -> dict[str, Any]:
    """Grade a coding response by running against all test cases (public + hidden)."""
    all_tests: list[dict[str, str]] = []
    if test_cases_json:
        all_tests.extend(test_cases_json.get("public", []))
        all_tests.extend(test_cases_json.get("hidden", []))

    if not all_tests:
        return {
            "score": 0.0,
            "method": "no_test_cases",
            "details": {"message": "No test cases available for grading"},
        }

    result = run_code_against_tests(source_code, language, all_tests)
    ratio = result.passed / result.total if result.total > 0 else 0
    return {
        "score": round(ratio * max_score, 2),
        "method": "test_cases",
        "details": {
            "passed": result.passed,
            "failed": result.failed,
            "total": result.total,
            "results": result.results,
        },
    }


async def grade_descriptive(
    question_content: str,
    response_content: str,
    correct_answer: str | None = None,
    max_score: float = 1.0,
) -> dict[str, Any]:
    """Grade a text/descriptive response using Claude LLM."""
    settings = get_settings()
    if not settings.claude_api_key:
        return {
            "score": 0.0,
            "method": "llm_unavailable",
            "details": {"message": "Claude API key not configured"},
        }

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)

        system_prompt = (
            "You are an expert evaluator. Grade the student's answer on a scale of 0 to 10.\n"
            "Return JSON with keys: score (0-10), feedback (string), strengths (list), weaknesses (list).\n"
            "Be fair and objective. Only return valid JSON, no markdown."
        )

        user_prompt = f"Question:\n{question_content}\n\n"
        if correct_answer:
            user_prompt += f"Model Answer:\n{correct_answer}\n\n"
        user_prompt += f"Student's Answer:\n{response_content}\n\nGrade this response."

        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

        data = json.loads(raw)
        llm_score = float(data.get("score", 0))
        normalised = round((llm_score / 10.0) * max_score, 2)

        return {
            "score": normalised,
            "method": "llm",
            "details": data,
        }
    except Exception as exc:
        logger.exception("LLM grading failed: %s", exc)
        return {
            "score": 0.0,
            "method": "llm_error",
            "details": {"error": str(exc)},
        }


async def auto_grade(
    question_type: str,
    response_content: str,
    question_content: str,
    correct_answer: str | None,
    test_cases_json: dict | None,
    max_score: float,
    language: str | None = None,
) -> dict[str, Any]:
    """Dispatch grading to the appropriate handler."""
    qtype = (question_type or "").lower()

    if qtype == "mcq" and correct_answer:
        return grade_mcq(response_content, correct_answer, max_score)
    elif qtype == "coding":
        return grade_coding(response_content, language or "python", test_cases_json, max_score)
    elif qtype in ("text", "descriptive", "short_answer"):
        return await grade_descriptive(question_content, response_content, correct_answer, max_score)
    else:
        if correct_answer:
            return grade_mcq(response_content, correct_answer, max_score)
        return await grade_descriptive(question_content, response_content, correct_answer, max_score)
