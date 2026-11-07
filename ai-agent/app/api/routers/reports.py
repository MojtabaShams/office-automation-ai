"""Admin reporting endpoints: dashboard summary, quick reports, builder data.

Every payload is aggregated from PostgreSQL by :mod:`app.services.report_service`.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission
from app.models.user import User
from app.schemas.common import ok
from app.services import report_service

router = APIRouter(prefix="/api/admin/reports", tags=["reports"])


@router.get("/summary")
def summary(
    _: User = Depends(require_permission("reports", "view")),
    db: Session = Depends(db_session),
) -> dict:
    return ok("خلاصه گزارش‌ها", **report_service.summary(db))


@router.get("/entities")
def entities(
    _: User = Depends(require_permission("reports", "view")),
    db: Session = Depends(db_session),
) -> dict:
    return ok("منابع داده گزارش", **report_service.entities(db))


@router.get("/events")
def events(
    limit: int = Query(default=200, ge=1, le=500),
    _: User = Depends(require_permission("reports", "view")),
    db: Session = Depends(db_session),
) -> dict:
    return ok("رویدادهای سیستم", events=report_service.events(db, limit=limit))


@router.get("/quick/{report_id}")
def quick_report(
    report_id: str,
    _: User = Depends(require_permission("reports", "view")),
    db: Session = Depends(db_session),
) -> dict:
    return ok("گزارش آماده", report=report_service.quick_report(db, report_id))


# ------------------------------------------------------------- saved reports
@router.get("")
def list_saved(
    _: User = Depends(require_permission("reports", "view")),
    db: Session = Depends(db_session),
) -> dict:
    reports = report_service.list_saved(db)
    return ok("گزارش‌های ذخیره‌شده", reports=reports, count=len(reports))


@router.post("")
def save_saved(
    payload: dict = Body(...),
    user: User = Depends(require_permission("reports", "create")),
    db: Session = Depends(db_session),
) -> dict:
    report = report_service.save_saved(db, payload, user.id)
    db.commit()
    return ok("گزارش ذخیره شد.", report=report)


@router.delete("/{report_id}")
def delete_saved(
    report_id: str,
    _: User = Depends(require_permission("reports", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    """Soft delete: the definition stays in the database for audit."""
    report_service.delete_saved(db, report_id)
    db.commit()
    return ok("گزارش حذف شد.", report_id=report_id, deleted=True)
