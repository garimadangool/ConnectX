"""Typed contracts that define what each agent receives and produces.

These schemas ARE the multi-agent design: every hand-off between agents
passes through one of these models, so nothing flows as raw text.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class FilterSpec(BaseModel):
    field: str
    value: Optional[str] = None
    operator: str = "eq"


class ParsedRequirement(BaseModel):
    """Produced by Agent 1. A developer requirement, structured."""
    requirement_text: str
    entities: list[str] = Field(default_factory=list)
    data_fields: list[str] = Field(default_factory=list)
    filters: list[FilterSpec] = Field(default_factory=list)
    frequency: str = Field(default="", description="daily / every 2 hours / every hour / weekly / on demand")
    destination: str = ""
    scope: Literal["single_record", "multiple_records", "summary_or_report"] = "single_record"


class FieldMapping(BaseModel):
    requested: str
    documented: Optional[str] = None
    matched: bool = False
    note: str = ""


class EndpointMatch(BaseModel):
    endpoint_id: str
    method: str
    path: str
    relevance: str = ""
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    unsupported_fields: list[str] = Field(default_factory=list)


class GroundingResult(BaseModel):
    """Produced by Agent 2. What the docs actually support."""
    matched_endpoints: list[EndpointMatch] = Field(default_factory=list)
    unsupported_fields: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RequestParam(BaseModel):
    name: str
    location: Literal["path", "query", "header"]
    value: Optional[str] = None
    required: bool = False
    source: str = ""  # why this param exists (business rationale)


class ApiCallDesign(BaseModel):
    """Produced by Agent 3. The concrete API call specification."""
    endpoint_id: str
    method: str
    path: str
    params: list[RequestParam] = Field(default_factory=list)
    expected_fields: list[str] = Field(default_factory=list)
    example_request: str = ""
    pagination_plan: str = ""
    justification: str = ""


class ConstraintReport(BaseModel):
    """Produced by Agent 4. Deterministic operational assessment."""
    auth_required: bool = True
    auth_header: str = "X-API-Key"
    pagination_needed: bool = False
    pagination_limit: int = 50
    rate_limit_risk: Literal["low", "medium", "high"] = "low"
    relevant_errors: list[int] = Field(default_factory=list)
    data_minimization_ok: bool = True
    blockers: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class GroundingCheck(BaseModel):
    """One deterministic verification result on the final plan."""
    item: str
    checked_against: str
    status: Literal["ok", "violation", "warning"]
    detail: str = ""


class GroundingVerification(BaseModel):
    """Output of the deterministic verifier (not an agent)."""
    checks: list[GroundingCheck] = Field(default_factory=list)
    grounded: bool = True
    summary: str = ""


class ReviewChecklistItem(BaseModel):
    requirement: str
    reason: str = ""


class IntegrationPlan(BaseModel):
    """Produced by Agent 5, verified by the deterministic check."""
    requirement_summary: str = ""
    recommended_endpoint: str = ""
    operation_steps: list[str] = Field(default_factory=list)
    params: list[RequestParam] = Field(default_factory=list)
    example_request: str = ""
    authentication: str = "API key via X-API-Key header (credentials never exposed)."
    pagination: str = ""
    error_handling: list[str] = Field(default_factory=list)
    expected_fields: list[str] = Field(default_factory=list)
    data_minimization: str = ""
    limitations: list[str] = Field(default_factory=list)
    unsupported_requirements: list[str] = Field(default_factory=list)
    developer_review_checklist: list[ReviewChecklistItem] = Field(default_factory=list)
    verification: GroundingVerification = Field(default_factory=GroundingVerification)