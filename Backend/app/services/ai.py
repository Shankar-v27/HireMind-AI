from typing import Any


def generate_aptitude_questions(*args: Any, **kwargs: Any) -> list[dict]:
    """
    Placeholder for LLM-powered aptitude question generation.
    This should call the configured LLM with appropriate prompts and return
    a list of normalized question dicts compatible with the Question model.
    """
    raise NotImplementedError("LLM-powered question generation not yet implemented")


def generate_coding_questions(*args: Any, **kwargs: Any) -> list[dict]:
    """
    Placeholder for LLM-powered coding question generation with test cases.
    """
    raise NotImplementedError("LLM-powered coding question generation not yet implemented")


def score_response(*args: Any, **kwargs: Any) -> float:
    """
    Placeholder for LLM-powered scoring of a candidate response.
    """
    raise NotImplementedError("LLM-powered scoring not yet implemented")

