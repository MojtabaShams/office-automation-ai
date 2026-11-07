"""Application settings.

All configuration is read from environment variables (optionally via ``ai-agent/.env``).
The settings object is immutable so it can safely be shared across threads.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # ai-agent/


def _normalize_database_url(url: str) -> str:
    """SQLAlchemy needs an explicit driver; psycopg (v3) is used across the project."""
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ------------------------------------------------------------------ app
    APP_NAME: str = "Office Automation AI Agent"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False

    # ------------------------------------------------------------- database
    DATABASE_URL: str = "postgresql+psycopg://admin:adminpass@localhost:5432/office_automation"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    AUTO_RUN_MIGRATIONS: bool = True

    # ----------------------------------------------------------------- auth
    # Short-lived access tokens: the admin panel re-authenticates when they expire.
    AUTH_TOKEN_TTL_MINUTES: int = 30
    AUTH_MAX_SESSIONS_PER_USER: int = 10
    AUTH_LOGIN_RATE_LIMIT: int = 8
    AUTH_LOGIN_RATE_WINDOW_SECONDS: int = 60
    AUTH_REGISTER_RATE_LIMIT: int = 5
    AUTH_REGISTER_RATE_WINDOW_SECONDS: int = 300
    ADMIN_MOBILE: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_FULL_NAME: str = "مدیر سامانه"

    # ------------------------------------------------------- payment gateways
    PAYMENT_GATEWAY_KEY_MIN_LENGTH: int = 8

    # ---------------------------------------------------------------- agent
    # Legacy single-model fallback (used only when no GapGPT key is configured).
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_TEMPERATURE: float = 0.2
    GROQ_MAX_TOKENS: int = 1200
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    AGENT_MAX_TOOL_ITERATIONS: int = 4

    # ------------------------------------------------- multi-model ensemble
    # GapGPT exposes an OpenAI-compatible endpoint, so all three vendors are
    # reached through the same client. Leave the key empty for fallback mode.
    GAPGPT_API_KEY: str = ""
    GAPGPT_BASE_URL: str = "https://api.gapgpt.app/v1"
    GAPGPT_MODEL_GEMINI: str = "gemini-2.5-flash"
    GAPGPT_MODEL_CHATGPT: str = "gpt-4o-mini"
    GAPGPT_MODEL_CLAUDE: str = "claude-sonnet-4"
    AGENT_ENSEMBLE_ENABLED: bool = True
    #: Independent comparison/synthesis call that picks or merges the best answer.
    AGENT_ENSEMBLE_JUDGE_ENABLED: bool = True
    #: Empty means "use the Claude model" as the judge.
    GAPGPT_MODEL_JUDGE: str = ""
    AGENT_ENSEMBLE_TIMEOUT_SECONDS: float = 28.0
    AGENT_ENSEMBLE_TEMPERATURE: float = 0.2
    AGENT_ENSEMBLE_MAX_TOKENS: int = 1200
    #: When a single model already produced structured actions and a usable answer,
    #: skip the extra judge round-trip (saves one call and some latency).
    AGENT_ENSEMBLE_EARLY_STOP: bool = True
    AGENTSCOPETEAM_ENABLED: bool = True

    # ----------------------------------------------------------- web search
    # Optional public context for the advisor (never used as process data).
    WEB_SEARCH_ENABLED: bool = False
    TAVILY_API_KEY: str = ""
    WEB_SEARCH_MAX_RESULTS: int = 4
    WEB_SEARCH_TIMEOUT_SECONDS: float = 6.0

    # ----------------------------------------------------------- embeddings
    EMBEDDING_PROVIDER: Literal["hashing", "openai"] = "hashing"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 384
    EMBEDDING_API_BASE: str = "https://api.openai.com/v1"
    EMBEDDING_API_KEY: str = ""

    # ------------------------------------------------------------- content
    FORMS_DIR: Path = BASE_DIR / "forms"
    KNOWLEDGE_DIR: Path = BASE_DIR / "knowledge"
    # Reference documents uploaded from the admin form builder (PDF/DOCX/images).
    UPLOADS_DIR: Path = BASE_DIR / "data" / "uploads"
    DOCUMENT_MAX_BYTES: int = 20 * 1024 * 1024
    DOCUMENT_TEXT_MAX_CHARS: int = 200_000
    SEED_ON_STARTUP: bool = True
    KNOWLEDGE_CHUNK_SIZE: int = 800
    KNOWLEDGE_CHUNK_OVERLAP: int = 120
    KNOWLEDGE_TOP_K: int = 4
    KNOWLEDGE_MIN_SCORE: float = 0.05

    # ---------------------------------------------------------------- chat
    CHAT_HISTORY_LIMIT: int = 20
    CHAT_SUMMARY_TRIGGER: int = 16
    CHAT_SUMMARY_MAX_CHARS: int = 1500
    CHAT_TITLE_MAX_CHARS: int = 60

    # ---------------------------------------------------------------- http
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3002,http://127.0.0.1:3002"
    )
    MAX_MESSAGE_CHARS: int = 4000

    @field_validator("DATABASE_URL")
    @classmethod
    def _validate_db_url(cls, value: str) -> str:
        return _normalize_database_url(value)

    @field_validator("FORMS_DIR", "KNOWLEDGE_DIR", "UPLOADS_DIR")
    @classmethod
    def _absolute_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BASE_DIR / value).resolve()

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        return origins or ["http://localhost:3000"]

    @property
    def llm_enabled(self) -> bool:
        return (
            self.ensemble_enabled
            or bool(self.GROQ_API_KEY.strip())
            or bool(self.OPENAI_API_KEY.strip())
        )

    @property
    def ensemble_enabled(self) -> bool:
        """True when the GapGPT key is set and the ensemble has not been switched off."""
        return self.AGENT_ENSEMBLE_ENABLED and bool(self.GAPGPT_API_KEY.strip())

    @property
    def ensemble_models(self) -> tuple[str, str, str]:
        """The three committee members (Gemini, ChatGPT, Claude) in a stable order."""
        return (
            self.GAPGPT_MODEL_GEMINI.strip(),
            self.GAPGPT_MODEL_CHATGPT.strip(),
            self.GAPGPT_MODEL_CLAUDE.strip(),
        )

    @property
    def ensemble_judge_model(self) -> str:
        return self.GAPGPT_MODEL_JUDGE.strip() or self.GAPGPT_MODEL_CLAUDE.strip()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
