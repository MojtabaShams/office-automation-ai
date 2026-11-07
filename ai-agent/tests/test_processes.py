"""Process publish validation, the case state machine and machine-checkable rules."""

from __future__ import annotations

import pytest

from app.core.exceptions import Conflict
from app.services import field_rules, process_service
from app.services.formula import FormulaError, evaluate_formula

FORMS = {
    "form_leave": {
        "id": "form_leave",
        "title": "فرم مرخصی",
        "is_active": True,
        "fields": [
            {"id": "days", "label": "تعداد روز", "type": "number", "required": True},
            {"id": "start", "label": "تاریخ شروع", "type": "date"},
        ],
    },
    "form_pay": {
        "id": "form_pay",
        "title": "فرم پرداخت",
        "is_active": True,
        "fields": [
            {
                "id": "fee",
                "label": "هزینه",
                "type": "payment",
                "payment": {"gatewayId": "gw-1", "amountSource": "fixed"},
            }
        ],
    },
}


def _definition(**overrides) -> dict:
    base = {
        "id": "process-leave",
        "code": "LEAVE-1",
        "title": "پروسه مرخصی",
        "stages": [
            {
                "id": "s1",
                "title": "ثبت متقاضی",
                "assignee": {"kind": "applicant"},
                "slaDays": 2,
                "formIds": ["form_leave"],
                "formVersions": {"form_leave": "1.0"},
                "routeRules": [],
            },
            {
                "id": "s2",
                "title": "بررسی مدیر",
                "assignee": {"kind": "role", "accessLevelId": "role-manager"},
                "slaDays": 3,
                "formIds": ["form_pay"],
                "formVersions": {"form_pay": "1.0"},
                "routeRules": [
                    {
                        "id": "r1",
                        "condition": {
                            "logic": "and",
                            "clauses": [{"variableId": "form_leave:days", "operator": "greaterThan", "value": "5"}],
                        },
                        "nextStageId": process_service.ROUTE_REJECT,
                    }
                ],
                "defaultNextStageId": process_service.ROUTE_COMPLETE,
            },
        ],
        "computedFields": [],
    }
    base.update(overrides)
    return base


# --------------------------------------------------------------------- formulas
def test_formula_evaluation_and_precedence() -> None:
    tokens = [
        {"kind": "variable", "variableId": "a"},
        {"kind": "operator", "value": "+"},
        {"kind": "number", "value": "2"},
        {"kind": "operator", "value": "*"},
        {"kind": "number", "value": "3"},
    ]
    assert evaluate_formula({"tokens": tokens}, {"a": 4}) == 10
    assert evaluate_formula({"tokens": []}, {}) == 0


def test_formula_functions_and_persian_digits() -> None:
    tokens = [
        {"kind": "function", "value": "max"},
        {"kind": "operator", "value": "("},
        {"kind": "number", "value": "۱۲"},
        {"kind": "operator", "value": ","},
        {"kind": "number", "value": "5"},
        {"kind": "operator", "value": ")"},
    ]
    assert evaluate_formula({"tokens": tokens}, {}) == 12


def test_formula_rejects_unknown_function() -> None:
    with pytest.raises(FormulaError):
        evaluate_formula({"tokens": [{"kind": "function", "value": "eval"}]}, {})


# --------------------------------------------------------------------- presets
def test_national_id_preset_accepts_persian_digits() -> None:
    field = {"label": "کد ملی", "type": "text", "validation": {"preset": "national_id"}}
    cleaned, error = field_rules.check_field_value(field, "۱۲۳۴۵۶۷۸۹۰")
    assert error is None
    assert cleaned == "1234567890"


def test_mobile_preset_rejects_landline() -> None:
    field = {"label": "موبایل", "type": "text", "validation": {"preset": "mobile_ir"}}
    _, error = field_rules.check_field_value(field, "0212345678")
    assert error is not None


def test_flat_pattern_still_works() -> None:
    field = {"label": "کد", "type": "text", "pattern": "^[0-9]{4}$"}
    _, error = field_rules.check_field_value(field, "12")
    assert error and "قالب" in error


def test_invalid_config_detected() -> None:
    assert not field_rules.is_config_valid({"validation": {"minLength": 5, "maxLength": 2}})
    assert not field_rules.is_config_valid({"validation": {"pattern": "(["}})


# ------------------------------------------------------------------ validation
def test_valid_definition_passes() -> None:
    issues = process_service.validate_definition(_definition(), FORMS)
    assert [issue for issue in issues if issue["severity"] == "error"] == []


def test_unresolved_legacy_assignee_blocks_publish() -> None:
    definition = _definition()
    definition["stages"][1]["assignee"] = {"kind": "role", "accessLevelId": ""}
    definition["stages"][1]["legacyAssigneeLabel"] = "کارشناس اداره"
    errors = [issue for issue in process_service.validate_definition(definition, FORMS) if issue["severity"] == "error"]
    assert any("کارشناس اداره" in issue["message"] for issue in errors)


def test_backward_route_is_rejected() -> None:
    definition = _definition()
    definition["stages"][1]["defaultNextStageId"] = "s1"
    errors = [issue for issue in process_service.validate_definition(definition, FORMS) if issue["severity"] == "error"]
    assert any("مراحل بعدی" in issue["message"] for issue in errors)


def test_missing_form_is_rejected() -> None:
    definition = _definition()
    definition["stages"][0]["formIds"] = ["missing-form"]
    errors = [issue for issue in process_service.validate_definition(definition, FORMS) if issue["severity"] == "error"]
    assert any("حذف‌شده" in issue["message"] for issue in errors)


# ------------------------------------------------------------------- routing
def test_next_target_uses_matching_rule_then_default() -> None:
    snapshot = _definition()
    stage = snapshot["stages"][1]
    assert process_service.next_target(snapshot, stage, {"form_leave:days": "9"}) == process_service.ROUTE_REJECT
    assert process_service.next_target(snapshot, stage, {"form_leave:days": "2"}) == process_service.ROUTE_COMPLETE


def test_terminal_routes_are_forward() -> None:
    snapshot = _definition()
    assert process_service.is_forward_target(snapshot, "s1", process_service.ROUTE_COMPLETE)
    assert process_service.is_forward_target(snapshot, "s1", "s2")
    assert not process_service.is_forward_target(snapshot, "s2", "s1")


def test_multi_branch_process_validates_and_routes() -> None:
    definition = _definition(
        stages=[
            {
                "id": "submit",
                "title": "ثبت درخواست",
                "assignee": {"kind": "applicant"},
                "slaDays": 2,
                "formIds": ["form_leave"],
                "formVersions": {"form_leave": "1.0"},
                "routeRules": [
                    {
                        "id": "short-leave",
                        "condition": {
                            "logic": "and",
                            "clauses": [{"variableId": "form_leave:days", "operator": "lessThan", "value": "5"}],
                        },
                        "nextStageId": "manager-fast",
                    },
                ],
                "defaultNextStageId": "manager-review",
            },
            {
                "id": "manager-fast",
                "title": "بررسی سریع",
                "assignee": {"kind": "role", "accessLevelId": "role-manager"},
                "slaDays": 1,
                "formIds": ["form_pay"],
                "formVersions": {"form_pay": "1.0"},
                "routeRules": [],
                "defaultNextStageId": process_service.ROUTE_COMPLETE,
            },
            {
                "id": "manager-review",
                "title": "بررسی کامل",
                "assignee": {"kind": "role", "accessLevelId": "role-manager"},
                "slaDays": 3,
                "formIds": ["form_pay"],
                "formVersions": {"form_pay": "1.0"},
                "routeRules": [],
                "defaultNextStageId": process_service.ROUTE_COMPLETE,
            },
        ],
    )

    issues = process_service.validate_definition(definition, FORMS)
    assert [issue for issue in issues if issue["severity"] == "error"] == []

    submit_stage = definition["stages"][0]
    assert process_service.next_target(definition, submit_stage, {"form_leave:days": "3"}) == "manager-fast"
    assert process_service.next_target(definition, submit_stage, {"form_leave:days": "8"}) == "manager-review"


def test_version_label_bumps_minor() -> None:
    assert process_service.next_version_label("1.0") == "1.1"
    assert process_service.next_version_label(None) == "1.0"
    assert process_service.next_version_label("garbage") == "1.0"


# ----------------------------------------------------------- case transitions
class _FakeSession:
    """Minimal stand-in: the state machine only calls ``flush``."""

    def flush(self) -> None:  # pragma: no cover - trivial
        return None


class _FakeCase:
    def __init__(self, snapshot: dict, values: dict | None = None) -> None:
        self.snapshot = snapshot
        self.values = values or {}
        self.compute_results: dict = {}
        self.stage_states: dict = {}
        self.timeline: list = []
        self.status = "active"
        self.substatus = "in-review"
        self.current_stage_id = "s2"
        self.needs_escalation = False
        self.due_at = None
        self.updated_at = None


def test_advance_to_complete_terminal() -> None:
    case = _FakeCase(_definition(), {"form_leave:days": "2"})
    result = process_service.advance_case(_FakeSession(), case, "u1")  # type: ignore[arg-type]
    assert result.status == "completed"
    assert result.substatus == "approved"
    assert result.current_stage_id is None


def test_advance_honours_reject_terminal() -> None:
    case = _FakeCase(_definition(), {"form_leave:days": "9"})
    result = process_service.advance_case(_FakeSession(), case, "u1")  # type: ignore[arg-type]
    assert result.status == "completed"
    assert result.substatus == "rejected"


def test_applicant_timeout_closes_case() -> None:
    snapshot = _definition()
    case = _FakeCase(snapshot)
    case.current_stage_id = "s1"
    result = process_service.expire_case(_FakeSession(), case)  # type: ignore[arg-type]
    assert result.status == "expired"
    assert result.substatus == "expired-user"


def test_employee_timeout_does_not_close_case() -> None:
    case = _FakeCase(_definition())
    result = process_service.expire_case(_FakeSession(), case)  # type: ignore[arg-type]
    assert result.status == "active"
    assert result.needs_escalation is True
    assert result.substatus == "escalation"


def test_reject_returns_to_nearest_applicant_stage() -> None:
    snapshot = _definition()
    snapshot["stages"][1]["onReject"] = "return_to_applicant"
    case = _FakeCase(snapshot)
    result = process_service.reject_case(_FakeSession(), case, "u1", "نقص مدرک")  # type: ignore[arg-type]
    assert result.status == "active"
    assert result.current_stage_id == "s1"
    assert result.substatus == "awaiting-user-documents"
    assert result.stage_states["s1"]["note"] == "نقص مدرک"


def test_reject_final_closes_case() -> None:
    snapshot = _definition()
    snapshot["stages"][1]["onReject"] = "reject_final"
    case = _FakeCase(snapshot)
    result = process_service.reject_case(_FakeSession(), case, "u1")  # type: ignore[arg-type]
    assert result.status == "completed"
    assert result.substatus == "rejected"


def test_escalate_requires_a_configured_target() -> None:
    case = _FakeCase(_definition())
    with pytest.raises(Conflict):
        process_service.escalate_case(_FakeSession(), case, "u1")  # type: ignore[arg-type]
