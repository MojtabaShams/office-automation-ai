"""Built-in forms rendered by the chat UI before a user is authenticated.

These are *not* stored in the database: they are part of the conversation contract and
are injected by the chat API (``status="auth_required"``) so the frontend can reuse its
inline form renderer without any special casing.
"""

from __future__ import annotations


def login_form() -> dict:
    return {
        "form_id": "login",
        "title": "ورود به میز خدمت",
        "submit_label": "ورود",
        "fields": [
            {
                "name": "mobile",
                "label": "شماره موبایل",
                "type": "tel",
                "required": True,
                "placeholder": "09xxxxxxxxx",
                "pattern": "^09[0-9]{9}$",
            },
            {
                "name": "password",
                "label": "رمز عبور",
                "type": "password",
                "required": True,
                "placeholder": "••••••••",
            },
        ],
        "footer_links": [{"action": "show_register", "label": "حساب کاربری ندارید؟ ثبت‌نام کنید"}],
    }


def register_form() -> dict:
    return {
        "form_id": "register",
        "title": "ثبت‌نام در میز خدمت",
        "submit_label": "ایجاد حساب",
        "fields": [
            {"name": "full_name", "label": "نام و نام خانوادگی", "type": "text", "required": True},
            {
                "name": "national_id",
                "label": "کد ملی",
                "type": "text",
                "required": True,
                "placeholder": "۱۰ رقم",
                "pattern": "^[0-9]{10}$",
            },
            {
                "name": "mobile",
                "label": "شماره موبایل",
                "type": "tel",
                "required": True,
                "placeholder": "09xxxxxxxxx",
                "pattern": "^09[0-9]{9}$",
            },
            {
                "name": "password",
                "label": "رمز عبور",
                "type": "password",
                "required": True,
                "minLength": 8,
            },
            {
                "name": "password_confirm",
                "label": "تکرار رمز عبور",
                "type": "password",
                "required": True,
                "minLength": 8,
            },
        ],
        "footer_links": [{"action": "show_login", "label": "قبلاً ثبت‌نام کرده‌اید؟ وارد شوید"}],
    }
