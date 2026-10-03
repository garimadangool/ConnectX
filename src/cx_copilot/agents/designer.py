"""Agent 3: Integration Designer — turns a grounded requirement into a concrete
API call specification (endpoint, params, expected fields, plan notes).
"""

from __future__ import annotations

from ..core.coerce import as_dict_list, as_list
from ..core.schemas import (ApiCallDesign, GroundingResult, ParsedRequirement,
                            RequestParam)

SYSTEM_PROMPT = """\
You are an API integration designer. You are given:
1) a parsed developer requirement, and
2) verified endpoint matches from the documentation.

Design the concrete API call. Return JSON with EXACTLY these keys:
{
  "endpoint_id": "list_orders",
  "method": "GET",
  "path": "/orders",
  "params": [
    {"name": "start_date", "location": "query", "value": "to-be-filled",
     "required": false, "source": "business need"}
  ],
  "expected_fields": ["order_id", "total", "payment_status"],
  "pagination_plan": "...",
  "justification": "one short paragraph explaining this call design"
}

Rules:
- endpoint_id MUST be one of the ids listed in the grounding result.
- path MUST match the documented path for that endpoint (use placeholders
  like {order_id} where relevant).
- params MUST be documented parameter names for that endpoint. Never invent.
- expected_fields MUST be documented response fields of that endpoint.
- If a needed value is unknown (e.g. a date), set value to "to-be-filled"
  with source explaining who provides it.
- If the requirement needs records that may exceed 50 per page, set a
  pagination_plan that says paginate with page/limit up to 50."""


class IntegrationDesigner:
    def __init__(self, llm, kb: dict):
        self.llm = llm
        self.kb = kb

    def _valid_query_params(self, endpoint_id: str) -> set[str]:
        for ep in self.kb["endpoints"]:
            if ep["id"] == endpoint_id:
                return {p["name"] for p in ep.get("query_params", [])}
        return set()

    def _valid_path_params(self, endpoint_id: str) -> set[str]:
        for ep in self.kb["endpoints"]:
            if ep["id"] == endpoint_id:
                return {p["name"] for p in ep.get("path_params", [])}
        return set()

    def _valid_fields(self, endpoint_id: str) -> set[str]:
        fields: set[str] = set()
        for ep in self.kb["endpoints"]:
            if ep["id"] != endpoint_id:
                continue
            for f in ep.get("response_fields", []):
                fields.add(f["name"])
                for n in f.get("nested", []):
                    fields.add(n["name"])
            break
        return fields

    def run(self, req: ParsedRequirement, grounded: GroundingResult) -> ApiCallDesign:
        prompt = (
            f"Parsed requirement:\n{req.model_dump_json(indent=2)}\n\n"
            f"Verified endpoint matches:\n{grounded.model_dump_json(indent=2)}"
        )
        raw = self.llm.generate(prompt, system=SYSTEM_PROMPT, temperature=0.0)

        # --- deterministic validation of the LLM's design ---
        endpoint_id = raw.get("endpoint_id") or ""
        valid_ep_ids = {e.endpoint_id for e in grounded.matched_endpoints}
        if endpoint_id not in valid_ep_ids:
            raise ValueError(
                f"Agent 3 proposed endpoint '{endpoint_id}' which is not in the grounded matches {valid_ep_ids}"
            )

        valid_q = self._valid_query_params(endpoint_id)
        valid_p = self._valid_path_params(endpoint_id)
        valid_fields = self._valid_fields(endpoint_id)

        params: list[RequestParam] = []
        for p in as_dict_list(raw.get("params"), name="name", location="location"):
            name = p.get("name", "")
            loc = p.get("location", "query")
            if loc == "query" and name not in valid_q:
                continue
            if loc == "path" and name not in valid_p:
                continue
            params.append(RequestParam(
                name=name,
                location=loc,
                value=p.get("value"),
                required=p.get("required", False),
                source=p.get("source", ""),
            ))

        expected = [f for f in as_list(raw.get("expected_fields")) if f in valid_fields]

        return ApiCallDesign(
            endpoint_id=endpoint_id,
            method=raw.get("method") or "GET",
            path=raw.get("path") or "",
            params=params,
            expected_fields=expected,
            pagination_plan=raw.get("pagination_plan") or "",
            justification=raw.get("justification") or "",
        )