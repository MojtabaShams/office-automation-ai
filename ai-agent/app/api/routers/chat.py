"""Chat endpoints.

The response envelope is frozen to what ``apps/client/app/components/ChatPanel.tsx``
already understands::

    {"status": "ok" | "auth_required" | "error", "message": "...",
     "form"?: {...}, "user"?: {...}, "token"?: "...", "session_id"?: "..."}

Extra keys are additive and ignored by older clients:

* ``process`` - legacy consultation payload (stages + first form),
* ``stepper`` - ``process_flow_service.stepper_payload``: the process id, version and
  every step/form the wizard renders,
* ``activity`` - ``[{"key", "label"}]`` behind-the-scenes indicators for this turn.
"""

from __future__ import annotations

import json
import logging
from queue import Queue
from threading import Thread

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, get_optional_user, require_user
from app.core.exceptions import AppError
from app.models.user import User
from app.repositories import session_repo
from app.schemas.chat import ChatRequest, RenameSessionRequest
from app.schemas.common import ok
from app.agents import activity
from app.services import auth_service, chat_attachment_service, chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _chat_payload(outcome: chat_service.ChatOutcome) -> dict:
    payload: dict = {"status": outcome.status, "message": outcome.message}
    if outcome.form is not None:
        payload["form"] = outcome.form
    if outcome.process is not None:
        # Stages of the process the applicant just confirmed.
        payload["process"] = outcome.process
    if outcome.stepper is not None:
        # Structured action: open the multi-step wizard for this process.
        payload["stepper"] = outcome.stepper
    if outcome.user is not None:
        payload["user"] = outcome.user
    if outcome.session_id:
        payload["session_id"] = outcome.session_id
    if outcome.citations:
        payload["citations"] = outcome.citations
    if outcome.activity:
        payload["activity"] = outcome.activity
    if outcome.intent:
        payload["intent"] = outcome.intent
    if outcome.action:
        payload["action"] = outcome.action
    return payload


@router.post("")
def chat(
    req: ChatRequest,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(db_session),
) -> dict:
    """Run one conversational turn (anonymous visitors are supported)."""
    outcome = chat_service.handle_chat(
        db,
        user=user,
        message=req.message,
        intent=req.intent,
        session_id=req.session_id,
        new_session=req.new_session,
        attachment_ids=req.attachment_ids,
    )
    return _chat_payload(outcome)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"


@router.post("/stream")
def chat_stream(
    req: ChatRequest,
    user: User | None = Depends(get_optional_user),
):
    """Stream live agent activity from the worker and then the complete chat envelope."""
    user_id = user.id if user is not None else None

    def events():
        results: Queue[tuple[str, dict[str, object]]] = Queue()
        yield _sse({
            "type": "activity",
            "key": "thinking",
            "label": "در حال بررسی درخواست شما…",
        })

        def run_turn() -> None:
            from app.core.database import SessionLocal

            worker_db = None
            try:
                worker_db = SessionLocal()
                worker_user = worker_db.get(User, user_id) if user_id else None
                if user_id and worker_user is None:
                    raise AppError("نشست کاربری معتبر نیست؛ دوباره وارد شوید.", status_code=401)
                activity.set_listener(lambda item: results.put(("activity", item)))
                outcome = chat_service.handle_chat(
                    worker_db,
                    user=worker_user,
                    message=req.message,
                    intent=req.intent,
                    session_id=req.session_id,
                    new_session=req.new_session,
                    attachment_ids=req.attachment_ids,
                )
                results.put(("done", _chat_payload(outcome)))
            except Exception as exc:
                logger.exception("Streaming chat turn failed")
                message = exc.message if isinstance(exc, AppError) else "در پردازش پیام خطایی رخ داد."
                results.put(("error", {"message": message}))
            finally:
                if worker_db is not None:
                    worker_db.close()

        Thread(target=run_turn, name="chat-stream-turn", daemon=True).start()
        while True:
            kind, payload = results.get()
            if kind == "activity":
                yield _sse({"type": "activity", **payload})
            elif kind == "done":
                yield _sse({"type": "done", "payload": payload})
                return
            else:
                yield _sse({"type": "error", **payload})
                return

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/attachments")
def upload_attachment(
    file: UploadFile = File(...),
    user: User = Depends(require_user),
) -> dict:
    """Store one applicant file (PDF/Word/text/image) before it is sent with a message."""
    attachment = chat_attachment_service.save_upload(user.id, file)
    return ok("فایل پیوست شد.", attachment=attachment)


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: str,
    user: User = Depends(require_user),
) -> FileResponse:
    path, meta = chat_attachment_service.get_for_user(user.id, attachment_id)
    return FileResponse(path, media_type=meta["mime"], filename=meta["name"])


@router.get("/sessions")
def sessions(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    payload = chat_service.list_sessions(db, user.id, limit=limit, offset=offset)
    return {**ok("فهرست گفتگوها"), **payload}


@router.post("/sessions")
def create_session(
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    session = session_repo.create_chat_session(db, user.id)
    return ok("گفتگوی جدید ایجاد شد.", session_id=session.id, user=auth_service.public_user(user))


@router.get("/sessions/{session_id}")
def session_detail(
    session_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    return {**ok("پیام‌های گفتگو"), **chat_service.session_messages(db, user.id, session_id)}


@router.patch("/sessions/{session_id}")
def session_rename(
    session_id: str,
    req: RenameSessionRequest,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    renamed = chat_service.rename_session(db, user.id, session_id, req.title)
    return ok("عنوان گفتگو به‌روزرسانی شد.", **renamed)


@router.delete("/sessions/{session_id}")
def session_delete(
    session_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    chat_service.delete_session(db, user.id, session_id)
    return ok("گفتگو حذف شد.", session_id=session_id)
