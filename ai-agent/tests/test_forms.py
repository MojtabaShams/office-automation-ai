"""Form definition normalisation and submission validation."""

from __future__ import annotations

import pytest

from app.core.exceptions import ValidationError
from app.services import form_service

RAW_FORM = {
    "id": "test_request",
    "title": "فرم آزمایشی",
    "description": "برای تست",
    "category": "عمومی",
    "submitLabel": "ارسال",
    "footerLinks": [{"action": "show_register", "label": "ثبت‌نام"}],
    "requirements": [{"title": "مدارک", "items": ["کارت ملی"]}],
    "fields": [
        {"name": "full_name", "label": "نام", "type": "text", "required": True, "minLength": 3},
        {"name": "role", "label": "نقش", "type": "select", "required": True, "options": ["کارمند", "مدیر"]},
        {"name": "days", "label": "تعداد روز", "type": "number", "required": True, "min": 1, "max": 30},
        {"name": "agree", "label": "تأیید", "type": "checkbox", "required": True},
        {"name": "code", "label": "کد", "type": "text", "required": False, "pattern": "^[0-9]{4}$"},
    ],
}


def test_to_ui_matches_chat_panel_contract() -> None:
    definition = form_service.normalize_definition(RAW_FORM)
    ui = definition.to_ui()

    assert ui["form_id"] == "test_request"
    assert ui["submit_label"] == "ارسال"
    assert ui["footer_links"][0]["action"] == "show_register"
    assert ui["fields"][0]["minLength"] == 3
    assert ui["fields"][2]["minValue"] == 1
    assert ui["fields"][2]["maxValue"] == 30


def test_schema_roundtrip_keeps_camel_case() -> None:
    definition = form_service.normalize_definition(RAW_FORM)
    schema = definition.to_schema()
    again = form_service.normalize_definition(schema)

    assert again.id == definition.id
    assert again.to_ui() == definition.to_ui()


@pytest.mark.parametrize(
    "patch, message",
    [
        ({"id": "Invalid Id"}, "شناسه"),
        ({"title": ""}, "عنوان"),
        ({"fields": []}, "فیلد"),
        ({"fields": [{"name": "x", "label": "x", "type": "select"}]}, "گزینه"),
        ({"fields": [{"name": "x", "type": "mystery"}]}, "پشتیبانی"),
    ],
)
def test_invalid_definitions_are_rejected(patch: dict, message: str) -> None:
    payload = {**RAW_FORM, **patch}
    with pytest.raises(ValidationError) as excinfo:
        form_service.normalize_definition(payload)
    assert message in excinfo.value.message


def test_duplicate_field_names_are_rejected() -> None:
    payload = {
        **RAW_FORM,
        "fields": [
            {"name": "a", "label": "الف", "type": "text"},
            {"name": "a", "label": "ب", "type": "text"},
        ],
    }
    with pytest.raises(ValidationError):
        form_service.normalize_definition(payload)


def test_submission_validation() -> None:
    definition = form_service.normalize_definition(RAW_FORM)

    cleaned = form_service.validate_submission(
        definition,
        {"full_name": "  سارا محمدی  ", "role": "مدیر", "days": "3", "agree": "on", "code": "1234"},
    )
    assert cleaned["full_name"] == "سارا محمدی"
    assert cleaned["days"] == "3"
    assert cleaned["agree"] is True


@pytest.mark.parametrize(
    "values, expected",
    [
        ({"full_name": "سارا", "role": "مدیر", "days": "3"}, "تأیید"),
        ({"full_name": "سارا", "role": "مدیر", "days": "0", "agree": True}, "کمتر از 1"),
        ({"full_name": "سارا", "role": "خارجی", "days": "3", "agree": True}, "گزینه‌های مجاز"),
        ({"full_name": "سارا", "role": "مدیر", "days": "3", "agree": True, "code": "12"}, "قالب"),
        ({"full_name": "اب", "role": "مدیر", "days": "3", "agree": True}, "حداقل"),
    ],
)
def test_submission_errors(values: dict, expected: str) -> None:
    definition = form_service.normalize_definition(RAW_FORM)
    with pytest.raises(ValidationError) as excinfo:
        form_service.validate_submission(definition, values)
    assert expected in excinfo.value.message


def test_builtin_auth_forms() -> None:
    login = form_service.builtin_form("login")
    register = form_service.builtin_form("register")

    assert login and login["form_id"] == "login"
    assert register and register["form_id"] == "register"
    assert {field["name"] for field in register["fields"]} >= {
        "full_name",
        "national_id",
        "mobile",
        "password",
        "password_confirm",
    }


def test_admin_builder_field_types_roundtrip() -> None:
    payload = {
        **RAW_FORM,
        "id": "rich_form",
        "fields": [
            {
                "id": "construction-section",
                "label": "مشخصات ملک",
                "type": "section",
                "subFields": [
                    {"id": "owner_name", "label": "نام مالک", "type": "text", "required": True},
                    {
                        "id": "ownership_doc",
                        "label": "سند مالکیت",
                        "type": "file",
                        "required": True,
                        "allowedFileTypes": ["application/pdf", "image/*"],
                        "maxFileSizeMb": 10,
                    },
                    {
                        "id": "leave_type",
                        "label": "نوع مرخصی",
                        "type": "radio",
                        "required": True,
                        "options": ["استحقاقی", "استعلاجی"],
                    },
                    {
                        "id": "members",
                        "label": "اعضای خانواده",
                        "type": "repeater",
                        "minRows": 1,
                        "maxRows": 4,
                        "subFields": [
                            {"id": "member_name", "label": "نام عضو", "type": "text", "required": True}
                        ],
                    },
                ],
            },
            {"id": "fee", "label": "مبلغ", "type": "payment", "required": True},
            {"id": "total", "label": "جمع", "type": "computed", "computed": {"formula": {"tokens": []}}},
        ],
    }

    definition = form_service.normalize_definition(payload)
    ui = definition.to_ui()

    assert ui["fields"][0]["subFields"][0]["name"] == "owner_name"
    assert ui["fields"][0]["subFields"][1]["type"] == "file"
    assert ui["fields"][0]["subFields"][2]["type"] == "select"
    assert ui["fields"][0]["subFields"][3]["type"] == "repeater"
    assert ui["fields"][1]["type"] == "payment"
    assert ui["fields"][2]["type"] == "computed"


def test_repeater_submission_is_preserved_and_validated() -> None:
    payload = {
        "id": "repeater_form",
        "title": "اعضای خانواده",
        "fields": [
            {
                "id": "family_members",
                "label": "اعضای خانواده",
                "type": "repeater",
                "required": True,
                "minRows": 1,
                "maxRows": 2,
                "subFields": [
                    {"id": "full_name", "label": "نام", "type": "text", "required": True}
                ],
            }
        ],
    }
    definition = form_service.normalize_definition(payload)

    cleaned = form_service.validate_submission(
        definition,
        {"family_members": [{"full_name": "سارا محمدی"}]},
    )
    assert cleaned["family_members"] == [{"full_name": "سارا محمدی"}]

    with pytest.raises(ValidationError):
        form_service.validate_submission(definition, {"family_members": [{"full_name": ""}]})
