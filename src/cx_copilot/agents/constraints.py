"""Agent 4: Constraint Engine — deterministic operational assessment.

No LLM here. Rate limits, pagination, auth, frequency, and error handling are
rules, not generation. This is the "where AI is the wrong tool" part of the
system, and it is fully unit-testable.
"""

from __future__ import annotations

from ..core.schemas import ApiCallDesign, ConstraintReport, ParsedRequirement

RATE_LIMIT_PER_MIN = 100
PAGE_LIMIT = 50

# frequency → estimated calls per run
FREQ_CALLS = {
    "daily": 2,
    "every 2 hours": 12,
    "every hour": 24,
    "weekly": 2,
    "on demand": 1,
    "not stated": 2,
}

ERROR_GUIDANCE = {
    401: "Authentication failed — developer must check API credentials.",
    404: "Resource not found — record the miss, continue processing, and log it.",
    429: "Rate limit exceeded — back off and retry after a delay; do not hammer.",
    500: "Server error — record and retry later or escalate.",
    503: "Service unavailable — pause and retry later.",
}


class ConstraintEngine:
    def __init__(self, kb: dict):
        self.kb = kb

    def run(self, req: ParsedRequirement, design: ApiCallDesign) -> ConstraintReport:
        # authentication is always required for this API
        auth_required = True

        # pagination: needed if the design could return > 50 records or the
        # requirement is bulk/multi-record and the endpoint returns lists
        pagination_needed = self._pagination_needed(req, design)

        # rate limit risk
        calls = FREQ_CALLS.get(req.frequency.lower(), 2)
        rate_risk: str = "low"
        if calls * 1.5 > RATE_LIMIT_PER_MIN or req.frequency.lower() == "every 2 hours":
            rate_risk = "medium"
        if req.frequency.lower() == "every hour" and pagination_needed:
            rate_risk = "high"

        # relevant errors: always include 401; include 404 if single_record;
        # include 429 if pagination/bulk; include 500 error handling generally
        relevant: list[int] = [401]
        if req.scope == "single_record":
            relevant.append(404)
        if pagination_needed or req.scope in ("multiple_records", "summary_or_report"):
            relevant.append(429)
        relevant.append(500)
        if design.endpoint_id == "get_single_order":
            relevant.append(404)

        critical = []
        if pagination_needed and not design.pagination_plan:
            critical.append("Pagination plan missing but request may exceed 50 records.")

        risks = []
        if req.frequency.lower() == "every hour" and pagination_needed:
            risks.append(
                "Hourly full sync risks rate-limit saturation (100 req/min); "
                "use incremental query or fewer pages per run."
            )

        return ConstraintReport(
            auth_required=auth_required,
            auth_header="X-API-Key",
            pagination_needed=pagination_needed,
            pagination_limit=PAGE_LIMIT,
            rate_limit_risk=rate_risk,
            relevant_errors=sorted(set(relevant)),
            data_minimization_ok=True,
            blockers=critical,
            risks=risks,
        )

    def _pagination_needed(self, req: ParsedRequirement, design: ApiCallDesign) -> bool:
        if design.endpoint_id != "list_orders":
            return False
        if req.scope == "single_record":
            return False
        # bulk retrieval of many orders may exceed one page
        return True