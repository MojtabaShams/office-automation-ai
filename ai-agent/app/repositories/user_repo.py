from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_token
from app.models.base import utcnow
from app.models.role import Role
from app.models.user import AuthSession, User


# --------------------------------------------------------------------------- users
def create_user(
    db: Session,
    *,
    full_name: str,
    national_id: str,
    mobile: str,
    password_hash: str,
    role_id: str | None = None,
    email: str | None = None,
    unit: str | None = None,
) -> User:
    user = User(
        full_name=full_name.strip(),
        national_id=national_id.strip(),
        mobile=mobile.strip(),
        password_hash=password_hash,
        role_id=role_id,
        email=(email or "").strip() or None,
        unit=(unit or "").strip() or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_id(db: Session, user_id: str, *, include_deleted: bool = False) -> User | None:
    user = db.get(User, user_id)
    if user is None or (user.is_deleted and not include_deleted):
        return None
    return user


def get_user_by_mobile(db: Session, mobile: str) -> User | None:
    return db.scalar(select(User).where(User.mobile == mobile.strip()))


def get_user_by_national_id(db: Session, national_id: str) -> User | None:
    return db.scalar(select(User).where(User.national_id == national_id.strip()))


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))


def list_users(
    db: Session,
    *,
    query: str | None = None,
    role_id: str | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[User]:
    stmt = select(User).where(User.is_deleted.is_(False))
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(like),
                User.mobile.ilike(like),
                User.national_id.ilike(like),
                User.email.ilike(like),
            )
        )
    if role_id:
        stmt = stmt.where(User.role_id == role_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    return list(db.scalars(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)))


def count_users(
    db: Session,
    *,
    role_code: str | None = None,
    role_id: str | None = None,
    is_active: bool | None = None,
) -> int:
    stmt = select(func.count()).select_from(User).where(User.is_deleted.is_(False))
    if role_code:
        stmt = stmt.join(Role, User.role_id == Role.id).where(Role.code == role_code)
    if role_id:
        stmt = stmt.where(User.role_id == role_id)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    return int(db.scalar(stmt) or 0)


def set_role(db: Session, user: User, role_id: str | None) -> User:
    user.role_id = role_id
    db.commit()
    db.refresh(user)
    return user


def touch_last_login(db: Session, user: User) -> None:
    user.last_login_at = utcnow()
    db.commit()


def update_profile(
    db: Session,
    user: User,
    *,
    full_name: str | None = None,
    email: str | None = None,
    unit: str | None = None,
) -> User:
    if full_name is not None:
        user.full_name = full_name
    if email is not None:
        user.email = email or None
    if unit is not None:
        user.unit = unit or None
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    """Archive an account: requests, chats and audit history keep the applicant."""
    user.is_deleted = True
    user.is_active = False
    user.deleted_at = utcnow()
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def update_password_hash(db: Session, user: User, password_hash: str) -> None:
    user.password_hash = password_hash
    db.commit()


# ------------------------------------------------------------------------ sessions
def create_session(db: Session, *, token: str, user_id: str, user_agent: str | None = None) -> AuthSession:
    """Persist a session; only the token digest is stored."""
    now = utcnow()
    session = AuthSession(
        token_hash=hash_token(token),
        user_id=user_id,
        user_agent=(user_agent or "")[:300] or None,
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(minutes=settings.AUTH_TOKEN_TTL_MINUTES),
    )
    db.add(session)
    db.commit()
    return session


def get_user_by_token(db: Session, token: str) -> User | None:
    """Resolve a bearer token to its user, enforcing expiry and revocation."""
    token_hash = hash_token(token)
    now = utcnow()
    session = db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    )
    if session is None:
        return None

    # Throttle the "last used" write to once every five minutes per session.
    if session.last_used_at is None or (now - session.last_used_at) > timedelta(minutes=5):
        db.execute(
            update(AuthSession).where(AuthSession.token_hash == token_hash).values(last_used_at=now)
        )
        db.commit()

    user = db.get(User, session.user_id)
    if user is None or not user.is_active or user.is_deleted:
        return None
    return user


def revoke_session(db: Session, token: str) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.token_hash == hash_token(token), AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def revoke_all_sessions(db: Session, user_id: str, *, keep_token: str | None = None) -> None:
    stmt = update(AuthSession).where(
        AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
    )
    if keep_token:
        stmt = stmt.where(AuthSession.token_hash != hash_token(keep_token))
    db.execute(stmt.values(revoked_at=utcnow()))
    db.commit()


def prune_sessions(db: Session, user_id: str) -> None:
    """Keep only the newest ``AUTH_MAX_SESSIONS_PER_USER`` live sessions."""
    live = list(
        db.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .order_by(AuthSession.created_at.desc())
        )
    )
    for old in live[settings.AUTH_MAX_SESSIONS_PER_USER :]:
        old.revoked_at = utcnow()
    db.commit()


def purge_expired_sessions(db: Session) -> int:
    now = utcnow()
    result = db.execute(
        AuthSession.__table__.delete().where(AuthSession.expires_at < now - timedelta(days=7))
    )
    db.commit()
    return int(result.rowcount or 0)
