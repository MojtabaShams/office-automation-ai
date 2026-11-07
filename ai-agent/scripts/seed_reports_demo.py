"""Seed a small, clearly marked demo dataset so the reports charts are demonstrable.

The reports pages read real tables. On a brand-new database those tables are empty, so
the charts would render as zeros. This script inserts:

* 12 submissions spread over the last 12 days with mixed statuses and status events;
* two chat conversations with a handful of messages;
* two published demo processes and six process cases.

Every row is tagged with the ``SEED-`` prefix (tracking code / id) and a
``[SEED]`` note or title suffix, so demo data is easy to spot and remove.
The script is idempotent: it exits early when the demo rows already exist.

Usage (from ``ai-agent/``)::

    .\\.venv\\Scripts\\python.exe scripts\\seed_reports_demo.py
    # remove the demo rows (keeps real data untouched):
    .\\.venv\\Scripts\\python.exe scripts\\seed_reports_demo.py --clean
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.base import new_id, utcnow  # noqa: E402
from app.models.chat import ChatMessage, ChatSession  # noqa: E402
from app.models.process import ProcessCase, ProcessDefinitionRow, ProcessVersion  # noqa: E402
from app.models.submission import Submission, SubmissionEvent  # noqa: E402
from app.models.user import User  # noqa: E402

SEED_PREFIX = "SEED-"
SEED_NOTE = "[SEED] داده نمونه برای نمایش گزارش‌ها"

STATUS_CYCLE = ("approved", "in_review", "rejected", "submitted", "need_info", "approved")
SUBJECTS = (
    "درخواست مرخصی استحقاقی",
    "درخواست مأموریت اداری",
    "درخواست اضافه‌کاری",
    "پیگیری فیش حقوقی",
    "درخواست گواهی اشتغال",
    "درخواست انتقال واحد",
)

TEHRAN_TZ = timezone(timedelta(hours=3, minutes=30))


def _clean(db) -> int:
    """Soft-delete the demo rows (business data is never physically deleted)."""
    removed = 0
    submissions = db.scalars(
        select(Submission).where(Submission.tracking_code.like(f"{SEED_PREFIX}%"))
    ).all()
    for submission in submissions:
        submission.is_deleted = True
        submission.deleted_at = utcnow()
        removed += 1
    sessions = db.scalars(select(ChatSession).where(ChatSession.title.like("[SEED]%"))).all()
    for session in sessions:
        session.is_deleted = True
        session.deleted_at = utcnow()
        removed += 1
    processes = db.scalars(
        select(ProcessDefinitionRow).where(ProcessDefinitionRow.code.like(f"{SEED_PREFIX}%"))
    ).all()
    for process in processes:
        process.is_deleted = True
        process.deleted_at = utcnow()
        removed += 1
    cases = db.scalars(
        select(ProcessCase).where(ProcessCase.tracking_code.like(f"{SEED_PREFIX}%"))
    ).all()
    for case in cases:
        case.is_deleted = True
        case.deleted_at = utcnow()
        removed += 1
    db.commit()
    return removed


def _seed_users(db) -> list[User]:
    users = list(
        db.scalars(
            select(User).where(User.is_deleted.is_(False)).order_by(User.created_at).limit(3)
        ).all()
    )
    if not users:
        raise SystemExit(
            "هیچ کاربری در پایگاه داده نیست؛ ابتدا سرویس را یک‌بار اجرا کنید تا نقش‌ها و "
            "کاربر مدیر ساخته شوند."
        )
    return users


def _seed_processes(db, actor_id: str | None) -> list[ProcessDefinitionRow]:
    today = utcnow()
    definitions = (
        {
            "id": "seed-process-leave",
            "code": f"{SEED_PREFIX}LEAVE",
            "title": "مرخصی استحقاقی (داده نمونه)",
            "department": "منابع انسانی",
            "stages": [("stage-apply", "ثبت درخواست", "applicant"), ("stage-review", "بررسی کارشناس", "role")],
        },
        {
            "id": "seed-process-mission",
            "code": f"{SEED_PREFIX}MISSION",
            "title": "مأموریت اداری (داده نمونه)",
            "department": "اداری و مالی",
            "stages": [("stage-apply", "ثبت درخواست", "applicant"), ("stage-approve", "تأیید مدیر", "employee")],
        },
    )
    rows: list[ProcessDefinitionRow] = []
    for definition in definitions:
        row = db.get(ProcessDefinitionRow, definition["id"])
        if row is None:
            row = ProcessDefinitionRow(id=definition["id"], code=definition["code"])
            db.add(row)
        stages = [
            {
                "id": stage_id,
                "title": title,
                "guidance": "داده نمونه برای نمایش گزارش‌ها",
                "assignee": {"kind": kind},
                "slaDays": 3,
                "formIds": [],
                "routeRules": [],
            }
            for stage_id, title, kind in definition["stages"]
        ]
        snapshot = {
            "id": definition["id"],
            "code": definition["code"],
            "title": definition["title"],
            "department": definition["department"],
            "description": SEED_NOTE,
            "status": "active",
            "version": "1.0",
            "stages": stages,
            "routeRules": [None for _ in stages],
            "computedFields": [],
            "lockedForms": [],
            "publishedAt": today.isoformat(),
        }
        row.title = definition["title"]
        row.department = definition["department"]
        row.description = SEED_NOTE
        row.status = "active"
        row.version_label = "1.0"
        row.draft_json = snapshot
        row.published_json = snapshot
        row.published_at = today
        row.published_by = actor_id
        row.created_by = actor_id
        row.is_deleted = False
        row.deleted_at = None
        db.add(row)
        has_version = db.scalar(
            select(ProcessVersion.id).where(
                ProcessVersion.process_id == row.id, ProcessVersion.version_label == "1.0"
            )
        )
        if not has_version:
            db.add(
                ProcessVersion(
                    process_id=row.id,
                    version_label="1.0",
                    snapshot=snapshot,
                    published_by=actor_id,
                )
            )
        rows.append(row)
    db.flush()
    return rows


def _seed_cases(db, processes: list[ProcessDefinitionRow], users: list[User]) -> int:
    today = utcnow()
    created = 0
    for index in range(6):
        process = processes[index % len(processes)]
        applicant = users[index % len(users)]
        started = today - timedelta(days=index + 1)
        status = "active" if index % 2 == 0 else "completed"
        snapshot = dict(process.published_json or {})
        stages = snapshot.get("stages") or []
        stage_id = str((stages[0] if stages else {}).get("id") or "stage-apply")
        case = ProcessCase(
            id=f"{SEED_PREFIX}{new_id('case')}",
            tracking_code=f"{SEED_PREFIX}{process.code}-{index + 1}",
            process_id=process.id,
            process_version_label=process.version_label,
            snapshot=snapshot,
            applicant_id=applicant.id,
            title=process.title,
            status=status,
            substatus="in-review" if status == "active" else "approved",
            current_stage_id=stage_id if status == "active" else None,
            needs_escalation=False,
            stage_states={stage_id: {"state": "current", "enteredAt": started.isoformat()}},
            values={},
            compute_results={},
            timeline=[
                {
                    "id": new_id("evt"),
                    "action": "start",
                    "actorId": applicant.id,
                    "at": started.isoformat(),
                    "description": SEED_NOTE,
                }
            ],
            due_at=started + timedelta(days=3) if status == "active" else None,
            is_deleted=False,
        )
        case.created_at = started
        case.updated_at = started + timedelta(days=2)
        db.add(case)
        created += 1
    db.flush()
    return created


def _seed_submissions(db, users: list[User]) -> int:
    today = utcnow()
    created = 0
    for index in range(12):
        applicant = users[index % len(users)]
        status = STATUS_CYCLE[index % len(STATUS_CYCLE)]
        submitted_at = today - timedelta(days=index)
        submission = Submission(
            id=new_id("sub"),
            tracking_code=f"{SEED_PREFIX}{1000 + index}",
            form_id=None,
            user_id=applicant.id,
            user_name=applicant.full_name,
            values={"subject": SUBJECTS[index % len(SUBJECTS)]},
            form_snapshot={"title": f"{SUBJECTS[index % len(SUBJECTS)]} (داده نمونه)", "fields": []},
            status=status,
            notes=SEED_NOTE,
            is_deleted=False,
        )
        submission.created_at = submitted_at
        submission.updated_at = submitted_at + timedelta(hours=6)
        db.add(submission)
        db.add(
            SubmissionEvent(
                submission_id=submission.id,
                status="submitted",
                note=SEED_NOTE,
                created_at=submitted_at,
            )
        )
        if status != "submitted":
            db.add(
                SubmissionEvent(
                    submission_id=submission.id,
                    status=status,
                    note=SEED_NOTE,
                    created_at=submitted_at + timedelta(hours=6),
                )
            )
        created += 1
    db.flush()
    return created


def _seed_chat(db, users: list[User]) -> int:
    today = utcnow()
    created = 0
    for index in range(2):
        applicant = users[index % len(users)]
        session = ChatSession(
            id=new_id("cs"),
            user_id=applicant.id,
            title=f"[SEED] گفتگوی نمونه {index + 1}",
            summary=SEED_NOTE,
            status="active",
            message_count=4,
            is_deleted=False,
        )
        session.last_activity_at = today - timedelta(days=index)
        db.add(session)
        db.flush()
        for message_index in range(4):
            db.add(
                ChatMessage(
                    session_id=session.id,
                    role="user" if message_index % 2 == 0 else "assistant",
                    content=f"{SEED_NOTE} — پیام {message_index + 1}",
                    created_at=session.last_activity_at - timedelta(hours=4 - message_index),
                )
            )
            created += 1
    db.commit()
    return created


def main() -> None:
    db = SessionLocal()
    try:
        if "--clean" in sys.argv:
            removed = _clean(db)
            print(f"demo rows soft-deleted: {removed}")
            return

        existing = db.scalar(
            select(Submission.id).where(Submission.tracking_code.like(f"{SEED_PREFIX}%")).limit(1)
        )
        if existing:
            print("demo data already present; pass --clean to remove it first")
            return

        users = _seed_users(db)
        processes = _seed_processes(db, users[0].id)
        cases = _seed_cases(db, processes, users)
        submissions = _seed_submissions(db, users)
        messages = _seed_chat(db, users)
        db.commit()
        print(
            "seed complete: "
            f"{submissions} submissions, {cases} cases, {messages} chat messages, "
            f"{len(processes)} processes (all tagged '{SEED_PREFIX}' / '{SEED_NOTE[:6]}')"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
