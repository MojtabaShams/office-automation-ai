"""Submission tracking and admin review payloads."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel

SUBMISSION_STATUSES = ("pending", "in_review", "approved", "rejected", "canceled")


class SubmissionStatusRequest(APIModel):
    status: str = Field(min_length=3, max_length=32)
    note: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(
        default=None,
        max_length=2000,
        validation_alias=AliasChoices("notes", "comment"),
    )


class TrackingRequest(APIModel):
    tracking_code: str = Field(
        min_length=4,
        max_length=32,
        validation_alias=AliasChoices("tracking_code", "trackingCode", "code"),
    )
