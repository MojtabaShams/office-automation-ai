from __future__ import annotations

import io
import json
from types import SimpleNamespace

import pytest
from docx import Document
from PIL import Image

from app.core.exceptions import AgentError, ValidationError
from app.services import chat_attachment_service, form_extraction_service as extraction


def test_text_file_is_extracted_and_uses_simulated_schema_without_llm(monkeypatch) -> None:
    monkeypatch.setattr(extraction, "_extraction_model", lambda: None)

    result = extraction.extract_form(
        "request.txt",
        "نام: سارا محمدی\nکد ملی: ۱۲۳۴۵۶۷۸۹۰".encode("utf-8"),
    )

    assert result["status"] == "success"
    assert result["mode"] == "simulated"
    assert result["simulated_node"] == "Text_Parser_Node"
    assert "سارا محمدی" in result["extracted_text_preview"]
    assert {field["name"] for field in result["form_schema"]["fields"]} >= {
        "national_id",
        "mobile",
    }
    assert result["extracted_values"] == {}


def test_docx_text_is_extracted_before_form_generation(monkeypatch) -> None:
    monkeypatch.setattr(extraction, "_extraction_model", lambda: None)
    document = Document()
    document.add_paragraph("درخواست مرخصی استحقاقی")
    encoded = io.BytesIO()
    document.save(encoded)

    result = extraction.extract_form("leave.docx", encoded.getvalue())

    assert result["mode"] == "simulated"
    assert result["simulated_node"] == "Word_Parser_Node"
    assert "مرخصی استحقاقی" in result["extracted_text_preview"]


def test_image_returns_metadata_and_explains_that_ocr_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(extraction, "_extraction_model", lambda: None)
    image = Image.new("RGB", (4, 3), color="white")
    encoded = io.BytesIO()
    image.save(encoded, format="PNG")

    result = extraction.extract_form("scan.png", encoded.getvalue())

    assert result["mode"] == "simulated"
    assert result["simulated_node"] == "Vision_OCR_Node"
    assert result["file_metadata"]["width"] == 4
    assert result["file_metadata"]["height"] == 3
    assert result["form_schema"]["fields"] == []
    assert "OCR" in result["message"]


def test_chat_attachment_prompt_discloses_when_image_content_is_unavailable() -> None:
    prompt = chat_attachment_service.prompt_block(
        [{"name": "scan.png", "mime": "image/png", "extension": ".png", "text": ""}]
    )

    assert "OCR فعال نیست" in prompt
    assert "نباید ادعا شود" in prompt


def test_llm_output_is_validated_and_values_are_limited_to_schema(monkeypatch) -> None:
    payload = {
        "title": "درخواست اداری",
        "fields": [
            {"name": "national_id", "label": "کد ملی", "type": "text", "required": True},
            {"name": "bad field", "label": "نامعتبر"},
        ],
        "extracted_values": {"national_id": "1234567890", "unlisted": "ignored"},
    }

    class FakeModel:
        def invoke(self, _messages):
            return SimpleNamespace(content=json.dumps(payload, ensure_ascii=False))

    monkeypatch.setattr(extraction, "_extraction_model", lambda: FakeModel())
    result = extraction.extract_form("request.md", "کد ملی: 1234567890".encode())

    assert result["mode"] == "llm"
    assert result["simulated_node"] is None
    assert result["form_schema"]["title"] == "درخواست اداری"
    assert result["form_schema"]["fields"] == [
        {"name": "national_id", "label": "کد ملی", "type": "text", "required": True}
    ]
    assert result["extracted_values"] == {"national_id": "1234567890"}


def test_invalid_or_unreadable_uploads_return_clear_validation_errors() -> None:
    with pytest.raises(ValidationError, match="فرمت فایل"):
        extraction.extract_form("payload.exe", b"data")
    with pytest.raises(ValidationError, match="DOC"):
        extraction.extract_form("legacy.doc", b"data")
    with pytest.raises(ValidationError, match="تصویر معتبر"):
        extraction.extract_form("broken.png", b"not an image")


def test_invalid_llm_json_is_not_reported_as_a_success() -> None:
    with pytest.raises(AgentError, match="ساخت‌یافته"):
        extraction._parse_generated_form("not json")


def test_extract_form_endpoint_requires_authentication(client) -> None:
    response = client.post(
        "/api/extract-form",
        files={"file": ("request.txt", b"request text", "text/plain")},
    )

    assert response.status_code == 401


def test_extract_form_endpoint_returns_the_structured_fallback(
    client, auth, monkeypatch
) -> None:
    monkeypatch.setattr(extraction, "_extraction_model", lambda: None)

    response = client.post(
        "/api/extract-form",
        files={"file": ("request.txt", "نام: سارا".encode("utf-8"), "text/plain")},
        headers=auth["headers"],
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["filename"] == "request.txt"
    assert result["mode"] == "simulated"
    assert result["extracted_text_preview"] == "نام: سارا"
