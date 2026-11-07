"""Tests for the newly added form/process/agent enhancement helpers."""

from app.services import form_service, process_service


def test_form_normalization_keeps_nested_and_conditional_fields() -> None:
    raw = {
        "id": "nested_form",
        "title": "فرم تودرتو",
        "fields": [
            {
                "name": "role",
                "label": "نقش",
                "type": "select",
                "required": True,
                "options": ["کارمند", "مدیر"],
            },
            {
                "name": "manager_note",
                "label": "توضیح مدیر",
                "type": "text",
                "required": False,
                "tooltip": "فقط برای مدیر",
                "ragContext": "قانون X",
                "visibleIf": {
                    "logic": "and",
                    "clauses": [{"variableId": "role", "operator": "equals", "value": "مدیر"}],
                },
            },
            {
                "name": "details",
                "label": "جزئیات",
                "type": "section",
                "subFields": [
                    {"name": "detail_text", "label": "متن", "type": "text", "required": True}
                ],
            },
        ],
    }
    definition = form_service.normalize_definition(raw)
    ui = definition.to_ui()
    assert ui["fields"][1]["tooltip"] == "فقط برای مدیر"
    assert ui["fields"][1]["ragContext"] == "قانون X"
    assert ui["fields"][1]["visibleIf"]["clauses"][0]["variableId"] == "role"
    assert definition.fields[2]["subFields"][0]["name"] == "detail_text"


def test_conditional_validation_skips_hidden_fields() -> None:
    raw = {
        "id": "cond_form",
        "title": "فرم شرطی",
        "fields": [
            {"name": "role", "label": "نقش", "type": "text", "required": True},
            {
                "name": "extra",
                "label": "اضافی",
                "type": "text",
                "required": True,
                "visibleIf": {
                    "logic": "and",
                    "clauses": [{"variableId": "role", "operator": "equals", "value": "مدیر"}],
                },
            },
        ],
    }
    definition = form_service.normalize_definition(raw)
    # When role != manager the extra field is hidden and not required.
    cleaned = form_service.validate_submission(definition, {"role": "کارمند"})
    assert cleaned["role"] == "کارمند"
    assert cleaned["extra"] == ""
    # When role == manager the extra field becomes required.
    try:
        form_service.validate_submission(definition, {"role": "مدیر"})
    except Exception as exc:
        assert "الزامی" in str(exc)


def test_process_stage_visibility() -> None:
    snapshot = {
        "stages": [
            {"id": "s1", "title": "مرحله ۱", "formIds": ["f1"]},
            {
                "id": "s2",
                "title": "مرحله ۲",
                "formIds": ["f2"],
                "visibleIf": {
                    "logic": "and",
                    "clauses": [{"variableId": "f1:days", "operator": "greaterThan", "value": "5"}],
                },
            },
        ]
    }
    assert process_service.stage_should_execute(snapshot["stages"][0], {}) is True
    assert process_service.should_skip_stage(snapshot["stages"][1], {"f1:days": "2"}) is True
    assert process_service.should_skip_stage(snapshot["stages"][1], {"f1:days": "9"}) is False
    assert len(process_service.visible_stages(snapshot, {"f1:days": "9"})) == 2