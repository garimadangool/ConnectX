"""Agent 1: Requirement Interpreter — raw developer text → ParsedRequirement.

Structured JSON out. This is the only agent that sees completely free-form
input; everything downstream receives typed data, not raw text.
"""

from __future__ import annotations

from ..core.coerce import as_dict_list, as_list, as_str, normalise_scope
from ..core.schemas import FilterSpec, ParsedRequirement

SYSTEM_PROMPT = """\
You are a requirements analyst for an order-management API support team.
A developer request arrives as free text. You convert it into a structured
JSON description of the integration need.

Return JSON with EXACTLY these keys:
{
  "entities": ["orders"],
  "data_fields": ["order_id", "total amount", "payment status"],
  "filters": [{"field": "...", "value": "...", "operator": "eq"}],
  "frequency": "daily",
  "destination": "Reporting System",
  "scope": "single_record"
}

Semantics:
- entities: what business objects are involved (orders, customers, delivery).
- data_fields: the specific data items the requester wants returned.
- filters: constraints on the retrieval (date ranges, status, customer id).
  For a date range, use operator "between" and field "created_at" with a
  value describing the window (e.g. "previous day").
- frequency: daily / every 2 hours / every hour / weekly / on demand / not stated.
- destination: where the data will be used, if stated.
- scope: single_record (one known id), multiple_records (a query/list), or
  summary_or_report (aggregate of many records).

Only include information that is actually in the developer request.
Do NOT invent fields, filters, or frequencies. If something is not stated,
use an empty list/string, or "not stated" for frequency."""


class RequirementInterpreter:
    def __init__(self, llm):
        self.llm = llm

    def run(self, requirement_text: str) -> ParsedRequirement:
        raw = self.llm.generate(requirement_text, system=SYSTEM_PROMPT, temperature=0.0)
        return ParsedRequirement(
            requirement_text=requirement_text,
            entities=as_list(raw.get("entities")),
            data_fields=as_list(raw.get("data_fields")),
            filters=[
                FilterSpec(**f)
                for f in as_dict_list(
                    raw.get("filters"),
                    field="field",
                    value="value",
                    operator="operator",
                )
                if f.get("field")
            ],
            frequency=raw.get("frequency") or "not stated",
            destination=raw.get("destination") or "",
            scope=normalise_scope(raw.get("scope")),
        )