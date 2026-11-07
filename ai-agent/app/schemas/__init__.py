"""Request/response schemas.

Import from the concrete module to keep dependencies explicit, e.g.::

    from app.schemas.chat import ChatRequest
"""

from __future__ import annotations

from .auth import ChangePasswordRequest, LoginRequest, ProfileUpdateRequest, RegisterRequest
from .chat import ChatRequest, RenameSessionRequest
from .common import APIModel, ok
from .forms import FormStatusRequest, FormSubmitRequest
from .gateways import (
    GatewayStatusRequest,
    PaymentGatewayCreateRequest,
    PaymentGatewayUpdateRequest,
)
from .knowledge import KnowledgeImportRequest, KnowledgeSearchRequest
from .roles import RoleCreateRequest, RolePermissionsRequest, RoleUpdateRequest
from .submissions import SubmissionStatusRequest, TrackingRequest
from .users import EmployeeCreateRequest, EmployeeUpdateRequest, UserStatusRequest

__all__ = [
    "APIModel",
    "ok",
    "RegisterRequest",
    "LoginRequest",
    "ChangePasswordRequest",
    "ProfileUpdateRequest",
    "ChatRequest",
    "RenameSessionRequest",
    "FormSubmitRequest",
    "FormStatusRequest",
    "KnowledgeSearchRequest",
    "KnowledgeImportRequest",
    "SubmissionStatusRequest",
    "TrackingRequest",
    "RoleCreateRequest",
    "RoleUpdateRequest",
    "RolePermissionsRequest",
    "PaymentGatewayCreateRequest",
    "PaymentGatewayUpdateRequest",
    "GatewayStatusRequest",
    "EmployeeCreateRequest",
    "EmployeeUpdateRequest",
    "UserStatusRequest",
]
