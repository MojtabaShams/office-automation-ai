"""AgentScope-backed specialist team for the existing service-desk workflow.

AgentScope owns team assignment and specialist context. LangGraph still owns the
application state, confirmation gates, tools, persistence and API contract.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable

try:
    from agentscope.agent import Agent
    from agentscope.credential import OpenAICredential
    from agentscope.message import Msg, TextBlock
    from agentscope.model import OpenAIChatModel
    from agentscope.pipeline import TeamMember, TeamPipeline
except ImportError:  # pragma: no cover - dependency failure is surfaced at startup
    Agent = None  # type: ignore[assignment]

from app.core.config import settings

logger = logging.getLogger(__name__)

_PERSIAN_POLICY = (
    "تو دستیار رسمی میز خدمت هستی. همیشه پاسخ نهایی را کامل و طبیعی به فارسی بده. "
    "اگر اطلاعات کافی نیست، حدس نزن و مرحله بعدی را روشن کن. "
    "برای اجرای فرم، ایجاد درخواست یا ادامه پرونده فقط طبق حقوق تأیید شده عمل کن."
)


def _message(name: str, text: str, role: str = "user") -> Msg:
    return Msg(name=name, content=[TextBlock(type="text", text=text)], role=role)  # type: ignore[arg-type]


def _text(message: Msg | None) -> str:
    if message is None:
        return ""
    blocks = message.content
    parts: list[str] = []
    for block in blocks:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(parts).strip()


def _model(model: str) -> OpenAIChatModel | None:
    if not settings.GAPGPT_API_KEY.strip():
        return None
    credential = OpenAICredential(
        api_key=settings.GAPGPT_API_KEY.strip(),
        base_url=settings.GAPGPT_BASE_URL.strip(),
    )
    return OpenAIChatModel(
        credential=credential,
        model=model,
        stream=False,
        max_retries=1,
    )


def build_agentscope_team() -> TeamPipeline | None:
    """Create the specialist team backed by the configured GapGPT credentials."""
    if Agent is None:
        logger.warning("AgentScope is not installed; specialist team is disabled.")
        return None

    leader_model = _model(settings.ensemble_judge_model)
    if leader_model is None:
        return None

    leader = Agent(
        name="coordinator",
        system_prompt=_PERSIAN_POLICY + "\nکار تو هدایت پرسش به متخصص مناسب است.",
        model=leader_model,
    )

    specialists: list[tuple[str, str, str]] = [
        ("knowledge", settings.ensemble_models[0], "پاسخ به سوالات قوانین و مدارک از دانش سازمانی."),
        ("form", settings.ensemble_models[1], "راهنمایی پر کردن فرم‌ها و تشخیص فیلدهای ناقص یا اشتباه."),
        ("process", settings.ensemble_models[2], "راهنمایی مراحل، شعبه‌های مجاز، مهلت‌ها و وضعیت پرونده."),
    ]

    members: list[TeamMember] = []
    for name, model_name, description in specialists:
        specialist_model = _model(model_name)
        if specialist_model is None:
            continue
        member = Agent(
            name=name,
            system_prompt=f"{_PERSIAN_POLICY}\nحوزه تخصصی تو: {description}",
            model=specialist_model,
        )
        members.append(TeamMember(agent=member, description=description))

    if not members:
        return None
    return TeamPipeline(leader=leader, members=members, reset_members=False)


async def _reply_team(team: TeamPipeline, text: str) -> str:
    final_reply = ""
    async for message in team.reply_stream(_message("کاربر", text)):
        if isinstance(message, Msg):
            final_reply = _text(message) or final_reply
    return final_reply.strip()


def answer_with_agentscope_team(
    text: str,
    history: Iterable[tuple[str, str]] = (),
) -> str | None:
    """Run a team turn synchronously; safe to call from sync LangGraph nodes."""
    team = build_agentscope_team()
    if team is None:
        return None

    prompt_parts = [item for _, item in history if item.strip()]
    prompt_parts.append(text.strip())
    prompt = "\n".join(prompt_parts[-12:])
    try:
        return asyncio.run(_reply_team(team, prompt)) or None
    except Exception:
        logger.exception("AgentScope specialist team turn failed")
        return None
