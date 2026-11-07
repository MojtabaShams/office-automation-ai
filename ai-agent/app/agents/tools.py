"""LangChain tools exposed to the advisor.

The database session and the confirmation flag are injected through context variables by
the runner, so the LLM never sees or controls them.
"""

from __future__ import annotations

import contextvars
import json

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.services import consultation_service, form_service, knowledge_service, process_flow_service, submission_service

from . import activity, guidance, web_search

_current_db: contextvars.ContextVar[Session | None] = contextvars.ContextVar("agent_db", default=None)
_current_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("agent_user", default=None)
_confirmed: contextvars.ContextVar[bool] = contextvars.ContextVar("agent_confirmed", default=False)


def set_context(*, db: Session, user_id: str | None, confirmed: bool = False) -> None:
    _current_db.set(db)
    _current_user_id.set(user_id)
    _confirmed.set(confirmed)


def _require_db() -> Session | None:
    return _current_db.get()


@tool
def search_knowledge(query: str) -> str:
    """جستجو در پایگاه دانش اداری برای یافتن قوانین، مقررات، مدارک و مراحل انجام کار."""
    db = _require_db()
    if db is None:
        return "پایگاه دانش در دسترس نیست."
    activity.record("knowledge")
    context, _, chunks = knowledge_service.search_context(db, query)
    if not chunks:
        return "در پایگاه دانش مطلبی پیدا نشد."
    return context


@tool
def list_available_forms() -> str:
    """فهرست فرم‌های فعال سامانه به همراه شناسه و دسته‌بندی."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    activity.record("db_forms")
    forms = form_service.list_forms(db)
    if not forms:
        return "هیچ فرم فعالی وجود ندارد."
    return "\n".join(f"- {form['form_id']} | {form['title']}" for form in forms)


@tool
def get_form_requirements(form_id: str) -> str:
    """دریافت مدارک، مراحل و فیلدهای الزامی یک فرم بر اساس شناسه آن."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    activity.record("db_forms")
    requirements = form_service.get_requirements_text(db, form_id)
    if requirements is None:
        return f"فرمی با شناسه «{form_id}» پیدا نشد. از list_available_forms استفاده کن."
    return requirements


@tool
def get_field_guidelines(field_name: str, form_id: str) -> str:
    """دریافت راهنمای دقیق یک فیلد از دیتابیس بر اساس نام یا برچسب آن."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    definition = form_service.get_definition(db, form_id)
    if definition is None:
        return f"فرم «{form_id}» پیدا نشد."
    activity.record("field_guidelines")
    query = (field_name or "").strip().lower()
    persisted = form_service.get_field_guideline(db, form_id, field_name)
    if persisted:
        parts = [
            f"فیلد «{persisted.get('field_name')}»",
            f"توضیح: {persisted.get('description') or '—'}",
        ]
        if persisted.get("filling_rules"):
            parts.append(f"قاعده تکمیل: {persisted['filling_rules']}")
        if persisted.get("examples"):
            parts.append(f"نمونه: {persisted['examples']}")
        return "\n".join(parts)
    for field in definition.fields:
        name = str(field.get("name") or "").lower()
        label = str(field.get("label") or "").lower()
        if query and (query in name or query in label):
            guidance = field.get("helpText") or field.get("help_text") or "راهنمایی ثبت‌شده‌ای برای این فیلد وجود ندارد."
            return (
                f"فیلد «{field.get('label') or field.get('name')}» "
                f"(شناسه {field.get('name')})\nراهنمای دیتابیس: {guidance}"
            )
    return "فیلد موردنظر در این فرم پیدا نشد."


def get_field_guidance(form_id: str, field_query: str) -> str:
    """Compatibility wrapper for callers using the original guidance tool name."""
    return get_field_guidelines.invoke(
        {"field_name": field_query, "form_id": form_id}
    )


@tool
def get_my_submissions() -> str:
    """دریافت آخرین درخواست‌های ثبت‌شده کاربر جاری به همراه کد پیگیری و وضعیت."""
    db = _require_db()
    user_id = _current_user_id.get()
    if db is None or not user_id:
        return "برای مشاهده درخواست‌ها ابتدا باید وارد حساب کاربری شوید."
    activity.record("db_submissions")
    return submission_service.summary_for_user(db, user_id)


@tool
def show_form(form_id: str, prefill: dict | None = None) -> str:
    """نمایش فرم به کاربر. فقط و فقط پس از تأیید صریح کاربر در پیام آخر قابل استفاده است."""
    if not _confirmed.get():
        return (
            "CONFIRMATION_REQUIRED: تأیید صریح کاربر ثبت نشده است. "
            "ابتدا مدارک و فیلدها را توضیح بده و از کاربر بپرس آیا فرم باز شود."
        )
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    form = form_service.get_form(db, form_id)
    if form is None:
        return f"فرمی با شناسه «{form_id}» وجود ندارد."
    if isinstance(prefill, dict) and prefill:
        return f"FORM_READY:{form_id}:PREFILL:{json.dumps(prefill, ensure_ascii=False)}"
    return f"FORM_READY:{form_id}"


@tool
def list_published_processes() -> str:
    """فهرست پروسه‌های منتشرشده سازمان به همراه شناسه، واحد و نسخه."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    activity.record("db_processes")
    return consultation_service.list_text(db)


@tool
def get_process_steps(process_id: str) -> str:
    """دریافت مراحل یک خدمت به ترتیب، همراه با راهنمای هر مرحله و واحد مسئول."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    text = guidance.steps_text(db, process_id)
    if text is None:
        return (
            f"خدمتی با شناسه «{process_id}» منتشر نشده است. "
            "از list_published_processes برای دیدن شناسه‌های معتبر استفاده کن."
        )
    return text


@tool
def get_process_forms(process_id: str) -> str:
    """دریافت فرم‌های مرحله متقاضی یک خدمت همراه با راهنمای فرم، مدارک لازم و هزینه‌ها."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    text = guidance.forms_text(db, process_id)
    if text is None:
        return f"خدمتی با شناسه «{process_id}» منتشر نشده است."
    return text


@tool
def search_web(query: str) -> str:
    """جستجوی اطلاعات عمومی در وب. فقط برای زمینه عمومی است، نه داده رسمی سازمان."""
    if not web_search.enabled():
        return "جستجوی وب در این محیط فعال نیست؛ فقط از داده‌های پایگاه داده استفاده کن."
    activity.record("web")
    text = web_search.search_text(query)
    if not text:
        return "نتیجه مفیدی در وب پیدا نشد."
    return text


@tool
def get_process_consultation_summary(process_id: str) -> str:
    """دریافت خلاصه مشاوره یک پروسه: مدارک لازم، هزینه‌ها، مدت تقریبی، پیش‌نیازها و مراحل."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    text = consultation_service.summary_text_for(db, process_id)
    if text is None:
        return (
            f"پروسه‌ای با شناسه «{process_id}» منتشر نشده است. "
            "از list_published_processes برای دیدن شناسه‌های معتبر استفاده کن."
        )
    return text


@tool
def show_process(process_id: str) -> str:
    """نمایش مراحل و فرم شروع یک پروسه. فقط و فقط پس از تأیید صریح کاربر در پیام آخر."""
    if not _confirmed.get():
        return (
            "CONFIRMATION_REQUIRED: تأیید صریح کاربر ثبت نشده است. "
            "ابتدا خلاصه مدارک، هزینه و مراحل را بگو و بپرس آیا فرم باز شود."
        )
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    payload = consultation_service.process_payload(db, process_id)
    if payload is None:
        return f"پروسه «{process_id}» یافت نشد یا هنوز منتشر نشده است."
    if not payload.get("form"):
        return "این پروسه در مرحله متقاضی فرم قابل ارائه‌ای ندارد."
    return f"PROCESS_READY:{process_id}"


@tool
def start_process(process_id: str) -> str:
    """باز کردن خدمت برای تکمیل فرم‌ها در پنل مرحله‌به‌مرحله.

    فقط و فقط پس از تأیید صریح کاربر در پیام آخر قابل استفاده است.
    """
    if not _confirmed.get():
        return (
            "CONFIRMATION_REQUIRED: تأیید صریح کاربر ثبت نشده است. "
            "ابتدا مراحل و فرم‌ها را توضیح بده و بپرس آیا فرایند باز شود."
        )
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    try:
        payload = process_flow_service.stepper_payload(db, process_id)
    except Exception:
        return f"خدمت «{process_id}» یافت نشد یا هنوز منتشر نشده است."
    activity.record("stepper")
    has_forms = any(
        step.get("collectsInput") and step.get("forms") for step in payload.get("steps") or []
    )
    if not has_forms:
        return "این خدمت فرمی برای تکمیل توسط متقاضی ندارد."
    return f"PROCESS_STARTED:{process_id}"


@tool
def track_request(tracking_code: str) -> str:
    """پیگیری وضعیت یک درخواست بر اساس کد پیگیری. وضعیت مرحله، اقدامات در انتظار و مراحل را گزارش می‌کند."""
    db = _require_db()
    if db is None:
        return "پایگاه داده در دسترس نیست."
    activity.record("db_submissions")
    user_id = _current_user_id.get()
    return submission_service.summary_for_tracking_code(
        db, tracking_code, user_id=user_id
    )


TOOLS = [
    search_knowledge,
    list_available_forms,
    get_form_requirements,
    get_field_guidelines,
    list_published_processes,
    get_process_consultation_summary,
    get_process_steps,
    get_process_forms,
    search_web,
    get_my_submissions,
    track_request,
    show_form,
    show_process,
    start_process,
]

TOOL_MAP = {tool_.name: tool_ for tool_ in TOOLS}
