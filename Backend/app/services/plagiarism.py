"""
Plagiarism and cross-plagiarism checking for coding rounds.

- Uses CLAUDE_API_KEY (or PLAGIARISM_API_KEY) when provided.
- check_code_plagiarism: Claude assesses if code looks AI-generated or copied.
- check_cross_plagiarism: token similarity + Claude comparison with other candidates' code.

Results are stored in Response.flags and can contribute to proctoring strikes.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _normalize_code(code: str) -> str:
    """Normalize code for comparison: strip comments, collapse whitespace."""
    if not code:
        return ""
    code = re.sub(r"#.*$", "", code, flags=re.MULTILINE)
    code = re.sub(r'""".*?"""', "", code, flags=re.DOTALL)
    code = re.sub(r"'''.*?'''", "", code, flags=re.DOTALL)
    code = re.sub(r"//.*$", "", code, flags=re.MULTILINE)
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.DOTALL)
    code = re.sub(r"\s+", " ", code.strip())
    return code


def has_plagiarism_warning(flags: dict[str, Any] | None) -> bool:
    if not isinstance(flags, dict):
        return False
    plagiarism = flags.get("plagiarism") or {}
    cross = flags.get("cross_plagiarism") or {}
    return bool(plagiarism.get("warning") or cross.get("warning"))


def _simple_similarity(a: str, b: str) -> float:
    """Jaccard similarity on token sets. 0..1."""
    if not a or not b:
        return 0.0
    ta, tb = set(a.split()), set(b.split())
    if not ta and not tb:
        return 1.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def _claude_plagiarism_request(code: str) -> dict[str, Any] | None:
    """Ask Claude: is this code likely AI-generated or copied? Returns parsed JSON or None."""
    settings = get_settings()
    api_key = (settings.claude_api_key or settings.plagiarism_api_key or "").strip()
    if not api_key:
        return None
    model = (settings.claude_model or "claude-sonnet-4-6").strip()
    code_snippet = (code or "")[:12000]
    prompt = f"""You are a code integrity checker. Analyze the following code submission and rate how likely it is to be AI-generated or copied from common sources (e.g. ChatGPT, GitHub, tutorials). Consider style, comments, structure, and typical human vs AI patterns.

Reply with ONLY a single JSON object, no markdown, no explanation. Keys: "ai_generated_score" (number 0.0 to 1.0), "warning" (boolean: true if ai_generated_score >= 0.7).

Code:
```
{code_snippet}
```
"""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model=model,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        if not msg.content or not msg.content[0].text:
            return None
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = next((i for i in range(len(lines) - 1, start - 1, -1) if "```" in lines[i]), len(lines))
            text = "\n".join(lines[start:end])
        return json.loads(text)
    except Exception as e:
        logger.warning("Claude plagiarism request failed: %s", e)
        return None


def check_code_plagiarism(
    code: str,
    question_id: int,
    candidate_id: int,
) -> dict[str, Any]:
    """
    Check if code appears AI-generated or copied. Uses Claude when API key is set.
    """
    result: dict[str, Any] = {
        "plagiarism_checked": False,
        "ai_generated_score": None,
        "source_match_score": None,
        "warning": False,
    }
    settings = get_settings()
    api_key = settings.claude_api_key or settings.plagiarism_api_key
    if not api_key:
        return result
    parsed = _claude_plagiarism_request(code or "")
    if parsed:
        result["plagiarism_checked"] = True
        score = parsed.get("ai_generated_score")
        if isinstance(score, (int, float)):
            result["ai_generated_score"] = round(float(score), 4)
        result["warning"] = parsed.get("warning") is True or (isinstance(score, (int, float)) and float(score) >= 0.7)
    else:
        result["plagiarism_checked"] = True
        result["warning"] = False
    return result


def _claude_cross_plagiarism_request(candidate_code: str, other_codes: list[str]) -> dict[str, Any] | None:
    """Ask Claude for max similarity between candidate code and others. Returns JSON with max_similarity, warning."""
    if not other_codes:
        return {"max_similarity": 0.0, "warning": False}
    settings = get_settings()
    api_key = (settings.claude_api_key or settings.plagiarism_api_key or "").strip()
    if not api_key:
        return None
    model = (settings.claude_model or "claude-sonnet-4-6").strip()
    candidate_snippet = (candidate_code or "")[:6000]
    others_text = "\n\n---\n\n".join((c or "")[:4000] for c in other_codes[:5])
    prompt = f"""You are a code similarity checker. Compare the first code block (Candidate A) with each of the following code blocks (Candidate B, C, ...). Rate how similar they are in logic, structure, and wording (0.0 = different, 1.0 = nearly identical or copied).

Reply with ONLY a single JSON object: "max_similarity" (number 0.0 to 1.0, the highest similarity found), "warning" (boolean: true if max_similarity >= 0.8).

Candidate A (current submission):
```
{candidate_snippet}
```

Other submissions:
```
{others_text}
```
"""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model=model,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        if not msg.content or not msg.content[0].text:
            return None
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1
            end = next((i for i in range(len(lines) - 1, 0, -1) if "```" in lines[i]), len(lines))
            text = "\n".join(lines[start:end])
        return json.loads(text)
    except Exception as e:
        logger.warning("Claude cross-plagiarism request failed: %s", e)
        return None


def check_cross_plagiarism(
    code: str,
    question_id: int,
    candidate_id: int,
    other_responses: list[tuple[int, str]],
) -> dict[str, Any]:
    """
    Compare code with other candidates' responses. Uses token similarity and Claude when API key is set.
    """
    result: dict[str, Any] = {
        "cross_plagiarism_checked": False,
        "max_similarity": 0.0,
        "similar_responses": [],
        "warning": False,
    }
    norm = _normalize_code(code or "")
    if not norm:
        return result
    best_id = None
    best_sim = 0.0
    others_for_claude: list[str] = []
    for other_id, other_code in other_responses:
        if not other_code or (isinstance(other_id, int) and other_id == candidate_id):
            continue
        other_norm = _normalize_code(other_code)
        sim = _simple_similarity(norm, other_norm)
        if sim > best_sim:
            best_sim = round(sim, 4)
            best_id = other_id
        others_for_claude.append(other_code)
    result["max_similarity"] = best_sim
    if best_id is not None:
        result["similar_responses"] = [best_id]
    result["cross_plagiarism_checked"] = True
    if others_for_claude:
        claude_out = _claude_cross_plagiarism_request(code or "", others_for_claude)
        if claude_out:
            cs = claude_out.get("max_similarity")
            if isinstance(cs, (int, float)):
                claude_sim = round(float(cs), 4)
                if claude_sim > result["max_similarity"]:
                    result["max_similarity"] = claude_sim
            result["warning"] = claude_out.get("warning") is True or result["max_similarity"] >= 0.8
        else:
            result["warning"] = result["max_similarity"] >= 0.85
    else:
        result["warning"] = False
    return result
