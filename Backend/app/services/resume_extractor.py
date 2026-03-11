"""
Extract text from a resume file using Claude Vision OCR.
Supports PDF (converted to image), images, and any document sent as base64.
"""

from __future__ import annotations

import base64
import io
import logging

logger = logging.getLogger(__name__)


def extract_resume_text(data_url_or_base64: str) -> str:
    """
    Accept a data URL or raw base64 of a resume file.
    Uses Claude Vision to OCR the content and return plain text.
    """
    from app.core.config import get_settings
    settings = get_settings()
    if not settings.claude_api_key:
        logger.warning("CLAUDE_API_KEY not set; cannot OCR resume")
        return ""

    b64 = data_url_or_base64
    mime = "image/png"
    if "," in b64 and b64.startswith("data:"):
        header, b64 = b64.split(",", 1)
        detected = header.split(";")[0].replace("data:", "").strip().lower()
        if detected:
            mime = detected

    try:
        raw = base64.b64decode(b64)
    except Exception:
        logger.warning("Could not decode base64 for resume")
        return ""

    if not mime or mime == "image/png":
        if raw[:5] == b"%PDF-":
            mime = "application/pdf"
        elif raw[:2] in (b"\xff\xd8",):
            mime = "image/jpeg"

    if "pdf" in mime:
        images_b64 = _pdf_pages_to_images(raw)
        if not images_b64:
            logger.warning("Could not convert PDF to images for OCR")
            return ""
        return _ocr_with_claude(images_b64, settings)

    return _ocr_with_claude([(b64, mime)], settings)


def _pdf_pages_to_images(raw: bytes) -> list[tuple[str, str]]:
    """Convert PDF pages to base64 PNG images using pdf2image or fitz."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=raw, filetype="pdf")
        results = []
        for page_num in range(min(len(doc), 5)):
            page = doc[page_num]
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            results.append((base64.b64encode(img_bytes).decode(), "image/png"))
        doc.close()
        return results
    except ImportError:
        pass

    try:
        from PIL import Image
        import struct
        # Minimal fallback: just send the raw PDF bytes as-is to Claude
        # Claude can handle PDFs directly via base64
        return [(base64.b64encode(raw).decode(), "application/pdf")]
    except ImportError:
        pass

    # Last resort: send raw PDF bytes - Claude's API supports PDF in some models
    return [(base64.b64encode(raw).decode(), "application/pdf")]


def _ocr_with_claude(
    pages: list[tuple[str, str]],
    settings: object,
) -> str:
    """Send one or more images/documents to Claude Vision for OCR."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)

        content: list[dict] = []
        for b64_data, media_type in pages[:5]:
            if "pdf" in media_type:
                content.append({
                    "type": "document",
                    "source": {"type": "base64", "media_type": "application/pdf", "data": b64_data},
                })
            else:
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": b64_data},
                })
        content.append({
            "type": "text",
            "text": (
                "Extract ALL text from this resume/CV document. "
                "Return the full text content preserving structure: "
                "name, contact info, education, experience, skills, projects, certifications, etc. "
                "Output ONLY the extracted text. No commentary."
            ),
        })

        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=4096,
            messages=[{"role": "user", "content": content}],
        )
        text = (msg.content[0].text if msg.content else "").strip()
        logger.info("Resume OCR extracted %d chars", len(text))
        return text
    except Exception as e:
        logger.exception("Claude Vision resume OCR failed: %s", e)
        return ""
