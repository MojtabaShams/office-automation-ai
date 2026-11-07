from app.agents.agentscope_team import build_agentscope_team
from app.core.config import settings


def test_agentscope_team_is_constructed_with_configured_gapgpt_key(monkeypatch):
    monkeypatch.setattr(settings, "GAPGPT_API_KEY", "test-key")
    team = build_agentscope_team()

    assert team is not None
    assert list(team.members) == ["knowledge", "form", "process"]
