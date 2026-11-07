"""Tests for intent recognition and form pre-filling helpers."""

from app.services import intent_service


def test_detect_intent_and_entities() -> None:
    text = "می‌خوام از ۲ آبان تا ۱۰ آبان مرخصی بگیرم"
    assert intent_service.detect_intent(text) == "leave_request"
    entities = intent_service.extract_entities(text)
    assert entities["leave_type"] == "مرخصی"
    assert entities["start_date"].endswith("/08/02")
    assert entities["end_date"].endswith("/08/10")
    assert entities["duration_days"] == 9


def test_shared_month_and_duration() -> None:
    entities = intent_service.extract_entities("می‌خواهم از ۱۰ تا ۲۰ آذر مرخصی بگیرم")
    assert entities["start_date"].endswith("/09/10")
    assert entities["end_date"].endswith("/09/20")
    assert entities["duration_days"] == 11


def test_english_transliterated_jalali_range_and_numeric_digits() -> None:
    entities = intent_service.extract_entities("From 10 Azar to 20 Azar")
    assert entities["start_date"].endswith("/09/10")
    assert entities["end_date"].endswith("/09/20")
    assert entities["duration_days"] == 11

    explicit = intent_service.extract_entities("از ۱۰ آذر ۱۴۰۳ تا ۲۰ آذر ۱۴۰۳")
    assert explicit["start_date"] == "1403/09/10"
    assert explicit["end_date"] == "1403/09/20"
    assert explicit["duration_days"] == 11


def test_leave_duration_is_retained_and_cross_new_year_dates_are_inclusive() -> None:
    incomplete = intent_service.extract_entities("I want 10 days of leave")
    assert incomplete["duration_days"] == 10
    assert "start_date" not in incomplete

    across_new_year = intent_service.extract_entities(
        "از ۲۹ اسفند ۱۴۰۳ تا ۵ فروردین ۱۴۰۴"
    )
    assert across_new_year["start_date"] == "1403/12/29"
    assert across_new_year["end_date"] == "1404/01/05"
    assert across_new_year["duration_days"] == 7


def test_broad_auth_phrases() -> None:
    assert intent_service.detect_intent("چطوری باید وارد حسابم شوم؟") == "auth_login"
    assert intent_service.detect_intent("می‌خواهم وارد حسابم شوم") == "auth_login"
    assert intent_service.detect_intent("چطور لاگین کنم") == "auth_login"
    assert intent_service.detect_intent("حساب ندارم") == "auth_register"
    assert intent_service.detect_intent("ثبت نام می‌خواهم") == "auth_register"
    assert intent_service.needs_auth("چطوری باید وارد حسابم شوم؟") is True
    assert intent_service.detect_intent("پروانه ساختمانی می‌خواهم") == "construction_permit"
    assert intent_service.detect_intent("ورود به حساب") == "auth_login"
    assert intent_service.detect_intent("ثبت نام کاربر جدید") == "auth_register"
    assert intent_service.needs_auth("ثبت نام کاربر جدید") is True


def test_construction_intent() -> None:
    assert intent_service.detect_intent("پروانه ساختمانی می‌خواهم") == "construction_permit"
    entities = {"start_date": "Nov 2", "end_date": "Nov 10", "leave_type": "مرخصی"}
    user_ctx = {"applicant_name": "سارا", "department": "اداری"}
    prefill = intent_service.build_prefill("leave_request", entities, user_ctx)
    fields = [
        {"name": "applicant_name", "type": "text"},
        {"name": "start_date", "type": "date"},
        {"name": "end_date", "type": "date"},
        {"name": "leave_type", "type": "select"},
    ]
    mapped = intent_service.map_prefill_to_fields(fields, prefill)
def test_prefill_mapping() -> None:
    entities = {"start_date": "Nov 2", "end_date": "Nov 10", "leave_type": "مرخصی"}
    user_ctx = {"applicant_name": "سارا", "department": "اداری"}
    prefill = intent_service.build_prefill("leave_request", entities, user_ctx)
    fields = [
        {"name": "applicant_name", "type": "text"},
        {"name": "start_date", "type": "date"},
        {"name": "end_date", "type": "date"},
        {"name": "leave_type", "type": "select"},
    ]
    mapped = intent_service.map_prefill_to_fields(fields, prefill)
    assert mapped["applicant_name"] == "سارا"
    assert mapped["start_date"] == "Nov 2"
    assert mapped["end_date"] == "Nov 10"
    assert mapped["leave_type"] == "مرخصی"
    assert mapped["applicant_name"] == "سارا"
    assert mapped["start_date"] == "Nov 2"
    assert mapped["end_date"] == "Nov 10"
    assert mapped["leave_type"] == "مرخصی"