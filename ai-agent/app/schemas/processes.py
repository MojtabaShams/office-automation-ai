"""Request models for the process (workflow) endpoints."""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel


class ProcessCaseStartRequest(APIModel):
    process_id: str = Field(alias="processId", min_length=1, max_length=64)
    applicant_id: str | None = Field(default=None, alias="applicantId", max_length=64)
    form_id: str | None = Field(default=None, alias="formId", max_length=64)
    title: str | None = Field(default=None, max_length=200)
    values: dict[str, object] = Field(default_factory=dict)


class ProcessActionRequest(APIModel):
    """Body of approve-and-advance / reject / escalate."""

    note: str | None = Field(default=None, max_length=2000)
    values: dict[str, object] = Field(default_factory=dict)
    #: ``reject`` only: force a final rejection even when the stage says ``return_to_applicant``.
    final: bool | None = None


class ApplicantSubmitRequest(APIModel):
    """A stepper submission: the answers of every applicant-stage form."""

    process_id: str = Field(alias="processId", min_length=1, max_length=64)
    #: ``{form_id: {field: value}}`` exactly as the stepper collected them.
    values: dict[str, dict] = Field(default_factory=dict)
    session_id: str | None = Field(default=None, alias="sessionId", max_length=64)
