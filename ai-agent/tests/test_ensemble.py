"""The multi-model committee: parallel calls, action voting, judging and degradation."""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agents import activity, ensemble, nodes
from app.agents.ensemble import Candidate, EnsembleTurn, model_label, normalize_actions, pick_winner


def _call(name: str, **args: Any) -> dict:
    return {"name": name, "args": args, "id": f"call-{name}", "type": "tool_call"}


class FakeModel:
    """Minimal ``BaseChatModel`` stand-in; ``invoke`` returns a scripted answer."""

    def __init__(
        self,
        content: str | None = "پاسخ آزمایشی",
        tool_calls: list[dict] | None = None,
        error: Exception | None = None,
        fail_first: int = 0,
    ) -> None:
        self.content = content
        self.tool_calls = tool_calls or []
        self.error = error
        self.fail_first = fail_first
        self.attempts = 0
        self.bound_tools: list[Any] | None = None

    def bind_tools(self, tools: list[Any]) -> "FakeModel":
        self.bound_tools = list(tools)
        return self

    def invoke(self, messages: list[Any]) -> AIMessage:
        self.attempts += 1
        if self.error is not None:
            raise self.error
        if self.fail_first >= self.attempts:
            raise RuntimeError("transient failure")
        return AIMessage(content=self.content or "", tool_calls=list(self.tool_calls))


def _install(monkeypatch: pytest.MonkeyPatch, clients: dict[str, FakeModel]) -> dict[str, int]:
    calls: dict[str, int] = {name: 0 for name in clients}

    def factory(model: str, temperature: float | None = None) -> FakeModel | None:
        calls[model] = calls.get(model, 0) + 1
        return clients.get(model)

    monkeypatch.setattr(ensemble, "get_chat_model", factory)
    monkeypatch.setattr(ensemble.settings, "GAPGPT_MODEL_JUDGE", "judge")
    monkeypatch.setattr(ensemble.settings, "AGENT_ENSEMBLE_JUDGE_ENABLED", True)
    monkeypatch.setattr(ensemble.settings, "AGENT_ENSEMBLE_EARLY_STOP", True)
    return calls


def _run(monkeypatch: pytest.MonkeyPatch, models: list[str], **kwargs: Any) -> EnsembleTurn:
    return ensemble.run_ensemble(
        system_prompt="دستور سیستمی",
        messages=[HumanMessage(content="فرم مرخصی می‌خواهم")],
        intent=kwargs.pop("intent", "form_request"),
        models=models,
        **kwargs,
    )


# ------------------------------------------------------------------------- helper API
def test_model_label_and_actions() -> None:
    assert model_label("gemini-2.5-flash") == "Gemini"
    assert model_label("gpt-4o-mini") == "ChatGPT"
    assert model_label("claude-sonnet-4") == "Claude"
    assert model_label("some-model") == "some-model"
    assert normalize_actions([_call("show_form", form_id="leave_request")]) == [
        {"name": "show_form", "args": {"form_id": "leave_request"}}
    ]
    assert normalize_actions(None) == []


# ------------------------------------------------------------------- parallel answers
def test_all_members_are_asked_in_parallel(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "gemini": FakeModel("پاسخ جمینای"),
        "gpt": FakeModel("پاسخ چت‌جی‌پی‌تی، کامل‌تر"),
        "claude": FakeModel("پاسخ کلود"),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])

    assert turn.message is not None
    assert turn.reply
    assert calls == {"gemini": 1, "gpt": 1, "claude": 1}
    assert len(turn.models_used) == 3
    assert all(candidate.latency_ms >= 0 for candidate in turn.candidates)


def test_single_member_skips_the_judge(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _install(monkeypatch, {"gemini": FakeModel("تنها پاسخ")})

    turn = _run(monkeypatch, ["gemini"])

    assert turn.reply == "تنها پاسخ"
    assert turn.judged is False
    assert calls == {"gemini": 1}


# ----------------------------------------------------------------- structured actions
def test_majority_action_wins_and_judge_writes_the_prose(monkeypatch: pytest.MonkeyPatch) -> None:
    form_call = _call("get_form_requirements", form_id="leave_request")
    clients = {
        "gemini": FakeModel("مدارک مرخصی را اینجا نوشتم", tool_calls=[form_call]),
        "gpt": FakeModel("مدارک مرخصی: گواهی پزشک", tool_calls=[form_call]),
        "claude": FakeModel("شاید فرم ماموریت منظورتان بود؟", tool_calls=[_call("list_available_forms")]),
        "judge": FakeModel("پاسخ ترکیبی داور"),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])

    assert turn.message is not None
    assert [call["name"] for call in turn.message.tool_calls] == ["get_form_requirements"]
    assert turn.message.tool_calls[0]["args"] == {"form_id": "leave_request"}
    assert turn.reply == "پاسخ ترکیبی داور"
    assert turn.judged is True
    assert turn.answer_model == "gemini"  # longest text among the agreeing members
    assert calls["judge"] == 1


def test_unanimous_committee_skips_the_judge_when_early_stop_is_on(monkeypatch: pytest.MonkeyPatch) -> None:
    show_form = _call("show_form", form_id="leave_request")
    clients = {
        "gemini": FakeModel("فرم را باز کردم", tool_calls=[show_form]),
        "gpt": FakeModel("فرم مرخصی برایتان باز شد", tool_calls=[show_form]),
        "claude": FakeModel("باز شد", tool_calls=[show_form]),
        "judge": FakeModel("نبايد صدا زده شود"),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])

    assert turn.unanimous is True
    assert turn.judged is False
    assert calls["judge"] == 0
    assert [call["name"] for call in turn.message.tool_calls] == ["show_form"]
    assert turn.reply == "فرم مرخصی برایتان باز شد"


def test_split_actions_are_not_decided_by_action_count(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "gemini": FakeModel("پاسخ کوتاه", tool_calls=[_call("show_form", form_id="leave_request")]),
        "gpt": FakeModel("پاسخ دیگر", tool_calls=[_call("start_process", process_id="leave")]),
        "claude": FakeModel("فقط توضیح بدون اقدام"),
    }
    _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])

    # No strict majority: the judge's merge must not invent an action.
    assert turn.message is not None
    assert turn.message.tool_calls == []


# ------------------------------------------------------------------------ degradation
def test_failed_member_is_retried_once(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "flaky": FakeModel("پاسخ دوم موفق بود", fail_first=1),
        # A different action keeps the committee from being unanimous, so the judge runs.
        "steady": FakeModel("پاسخ پایدار", tool_calls=[_call("search_knowledge", query="مرخصی")]),
        "judge": FakeModel("پاسخ ترکیبی"),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["flaky", "steady"])

    # The retry succeeds after the first failure, so both answers reach the committee.
    assert calls["flaky"] == 2
    assert turn.message is not None
    assert set(turn.models_used) == {"flaky", "steady"}


def test_one_member_survives_a_dead_committee(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "dead": FakeModel(error=RuntimeError("timeout")),
        "alive": FakeModel("پاسخ زنده"),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["dead", "alive"])

    assert turn.reply == "پاسخ زنده"
    assert turn.models_failed == ["dead"]
    assert calls["dead"] == 2  # initial attempt + one retry
    assert calls["alive"] == 1


def test_every_member_failing_returns_no_message(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "a": FakeModel(error=RuntimeError("401")),
        "b": FakeModel(error=RuntimeError("401")),
        "c": FakeModel(error=RuntimeError("401")),
    }
    calls = _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["a", "b", "c"])

    assert turn.message is None
    assert turn.reply == ""
    assert len(turn.candidates) == 3
    # A total outage is not retried model by model (it would only double the latency).
    assert calls == {"a": 1, "b": 1, "c": 1}


def test_judge_failure_falls_back_to_the_longest_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = {
        "gemini": FakeModel("پاسخ کوتاه"),
        "gpt": FakeModel("پاسخ بلندتر و کامل‌تر"),
        "claude": FakeModel(error=RuntimeError("down")),
        "judge": FakeModel(error=RuntimeError("judge down")),
    }
    _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])

    assert turn.judged is False
    assert turn.reply == "پاسخ بلندتر و کامل‌تر"


# -------------------------------------------------------------------------- selection
def test_pick_winner_prefers_the_richest_answer() -> None:
    form_call = _call("show_form", form_id="leave_request")
    candidates = [
        Candidate(model="gemini-2.5-flash", response=AIMessage(content="پاسخ بسیار طولانی ولی متفاوت", tool_calls=[])),
        Candidate(
            model="gpt-4o-mini",
            response=AIMessage(content="کوتاه", tool_calls=[form_call]),
        ),
        Candidate(
            model="claude-sonnet-4",
            response=AIMessage(content="باز کن", tool_calls=[form_call]),
        ),
    ]

    winner = pick_winner(candidates, intent="form_request")

    assert winner is not None
    assert winner.model == "claude-sonnet-4"


def test_knowledge_answers_that_cite_the_kb_win_ties() -> None:
    candidates = [
        Candidate(model="gemini-2.5-flash", response=AIMessage(content="پاسخ عمومی کوتاه")),
        Candidate(model="claude-sonnet-4", response=AIMessage(content="بر اساس [1] پاسخ دقیق")),
    ]

    winner = pick_winner(candidates, intent="knowledge")

    assert winner is not None
    assert winner.model == "claude-sonnet-4"


def test_trace_lists_every_member() -> None:
    turn = EnsembleTurn(
        message=AIMessage(content="پاسخ"),
        candidates=[
            Candidate(model="gemini-2.5-flash", response=AIMessage(content="a"), latency_ms=120),
            Candidate(model="gpt-4o-mini", error="boom"),
        ],
        answer_model="gemini-2.5-flash",
        judged=True,
    )

    trace = ensemble.describe(turn)

    assert "Gemini: 120ms" in trace
    assert "ChatGPT: خطا" in trace
    assert "ترکیب با داور" in trace


def test_action_only_answer_gets_a_fallback_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    show_form = _call("show_form", form_id="leave_request")
    clients = {
        "gemini": FakeModel("", tool_calls=[show_form]),
        "gpt": FakeModel("", tool_calls=[show_form]),
        "claude": FakeModel("", tool_calls=[show_form]),
    }
    _install(monkeypatch, clients)

    turn = _run(monkeypatch, ["gemini", "gpt", "claude"])
    assert turn.message is not None
    assert turn.reply == ""  # the ensemble itself does not invent prose

    finalized = nodes._finalize_advisor(
        turn.message,
        {"messages": [HumanMessage(content="بله، بازش کن")], "intent": "confirm"},
        None,
        "leave_request",
        [],
    )
    assert finalized["messages"][0].content.strip()
    assert [call["name"] for call in finalized["messages"][0].tool_calls] == ["show_form"]


# ----------------------------------------------------------------------- advisor glue
def test_advisor_uses_the_ensemble_and_keeps_the_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    reply = "مدارک لازم: گواهی پزشک. آیا فرم را باز کنم؟"
    turn = EnsembleTurn(
        message=AIMessage(content=reply),
        candidates=[Candidate(model="gemini-2.5-flash", response=AIMessage(content=reply))],
        answer_model="gemini-2.5-flash",
    )
    monkeypatch.setattr(nodes.settings, "GAPGPT_API_KEY", "test-key")
    monkeypatch.setattr(nodes, "run_ensemble", lambda **_: turn)

    result = nodes.advisor(
        {
            "messages": [HumanMessage(content="فرم مرخصی می‌خواهم")],
            "intent": "form_request",
            "pending_form_id": None,
            "context": "",
        },
        {"configurable": {"db": None}},
    )

    assert result["messages"][0].content == reply
    assert result["answer_model"] == "gemini-2.5-flash"
    assert result["ensemble_trace"]


def test_advisor_marks_deterministic_fallback_when_no_provider_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(nodes, "get_llm", lambda: None)
    monkeypatch.setattr(nodes.settings, "GAPGPT_API_KEY", "")
    monkeypatch.setattr(nodes.settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(nodes.settings, "OPENAI_API_KEY", "")
    activity.reset()

    result = nodes.advisor(
        {
            "messages": [HumanMessage(content="ساعت کاری چیست؟")],
            "intent": "general",
            "pending_form_id": None,
            "context": "",
        },
        {"configurable": {"db": None}},
    )

    assert result["messages"][0].content
    assert {
        "key": "model_fallback",
        "label": "مدل زبانی در دسترس نبود؛ پاسخ جایگزین ارائه شد.",
    } in activity.collected()
    activity.reset()
