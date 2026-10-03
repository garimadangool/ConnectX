"""Deterministic grounding verifier.

This is the anti-hallucination kernel. It checks every endpoint, parameter,
and referenced field in a candidate plan against the knowledge base using
pure string/structure matching -- no LLM judgement involved. If the plan
references something not in the docs, it fails here and triggers a re-plan.
"""

from __future__ import annotations

import json
from pathlib import Path

from .schemas import GroundingCheck, GroundingVerification, IntegrationPlan

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_knowledge_base(path: Path | str | None = None) -> dict:
    path = Path(path) if path else DATA_DIR / "knowledge_base.json"
    return json.loads(path.read_text(encoding="utf-8"))


class GroundingVerifier:
    def __init__(self, kb: dict):
        self.kb = kb
        self.endpoints = kb["endpoints"]

    def find_endpoint(self, method: str, path: str) -> dict | None:
        for ep in self.endpoints:
            if ep["method"].upper() == method.upper() and ep["path"].strip("/") == path.strip("/"):
                return ep
        return None

    def allowed_query_params(self, endpoint_id: str) -> set[str]:
        ep = self._endpoint(endpoint_id)
        return {p["name"] for p in ep.get("query_params", [])}

    def allowed_path_params(self, endpoint_id: str) -> set[str]:
        ep = self._endpoint(endpoint_id)
        return {p["name"] for p in ep.get("path_params", [])}

    def documented_field_names(self, endpoint_id: str) -> set[str]:
        ep = self._endpoint(endpoint_id)
        names: set[str] = set()
        for f in ep.get("response_fields", []):
            names.add(f["name"])
            for n in f.get("nested", []):
                names.add(n["name"])
        return names

    def documented_field_names_anywhere(self) -> set[str]:
        names: set[str] = set()
        for ep in self.endpoints:
            names |= self.documented_field_names(ep["id"])
        return names

    def _endpoint(self, endpoint_id: str) -> dict:
        for ep in self.endpoints:
            if ep["id"] == endpoint_id:
                return ep
        raise KeyError(f"endpoint not in knowledge base: {endpoint_id}")

    def verify_path_params(self, plan: IntegrationPlan, ep: dict) -> list[GroundingCheck]:
        checks: list[GroundingCheck] = []
        provided = {p.name for p in plan.params if p.location == "path"}
        for req in ep.get("path_params", []):
            if req["required"] and req["name"] not in provided:
                checks.append(GroundingCheck(
                    item=f"path param {req['name']}",
                    checked_against=ep["id"],
                    status="violation",
                    detail=f"required path parameter '{req['name']}' is missing from the plan",
                ))
        return checks

    def verify_query_params(self, plan: IntegrationPlan, ep: dict) -> list[GroundingCheck]:
        checks: list[GroundingCheck] = []
        allowed = self.allowed_query_params(ep["id"])
        for p in plan.params:
            if p.location == "query" and p.name not in allowed:
                checks.append(GroundingCheck(
                    item=f"query param {p.name}",
                    checked_against=ep["id"],
                    status="violation",
                    detail=f"'{p.name}' is not a documented query parameter of {ep['id']}",
                ))
        return checks

    def verify_query_string(self, query: str, ep: dict) -> list[GroundingCheck]:
        """Validate params embedded in the endpoint URL itself (e.g. ?discount=true).

        The designer/synthesizer sometimes bake query params into the
        recommended_endpoint string; those must be grounded against the same
        documented set as `plan.params`.
        """
        if not query.strip():
            return []
        checks: list[GroundingCheck] = []
        allowed = self.allowed_query_params(ep["id"])
        for pair in query.split("&"):
            name = pair.split("=", 1)[0].strip()
            if not name:
                continue
            if name not in allowed:
                checks.append(GroundingCheck(
                    item=f"query param {name}",
                    checked_against=ep["id"],
                    status="violation",
                    detail=f"'{name}' (in the endpoint URL) is not a documented query parameter of {ep['id']}",
                ))
        return checks

    def verify_unsupported_fields(self, unsupported_fields: list[str]) -> list[GroundingCheck]:
        """Any field the requirement asked for that the docs cannot provide is a violation.

        The synthesizer is free to note the item as a limitation, but the plan
        must not be reported as fully grounded while the request is unsatisfied.
        """
        checks: list[GroundingCheck] = []
        for f in unsupported_fields:
            checks.append(GroundingCheck(
                item=f"unsupported requested field {f}",
                checked_against="knowledge base",
                status="violation",
                detail=f"'{f}' was requested but is not documented on any endpoint; the plan is NOT fully grounded",
            ))
        return checks

    def verify_expected_fields(self, plan: IntegrationPlan, ep: dict) -> list[GroundingCheck]:
        checks: list[GroundingCheck] = []
        valid = self.documented_field_names(ep["id"])
        valid_anywhere = self.documented_field_names_anywhere()
        for f in plan.expected_fields:
            if f not in valid:
                status = "warning" if f in valid_anywhere else "violation"
                detail = (
                    f"'{f}' is documented only on another endpoint; check closest documented alternative"
                    if status == "warning"
                    else f"'{f}' is not a documented response field of {ep['id']} or any endpoint"
                )
                checks.append(GroundingCheck(
                    item=f"response field {f}",
                    checked_against=ep["id"],
                    status=status,
                    detail=detail,
                ))
        return checks

    def verify(
        self,
        plan: IntegrationPlan,
        unsupported_fields: list[str] | None = None,
    ) -> GroundingVerification:
        checks: list[GroundingCheck] = []

        raw = plan.recommended_endpoint
        method, _, remainder = raw.partition(" ")
        path, _, query = remainder.partition("?")
        ep = self.find_endpoint(method, path)
        if ep is None:
            checks.append(GroundingCheck(
                item="endpoint",
                checked_against="knowledge base",
                status="violation",
                detail=f"'{plan.recommended_endpoint}' does not exist in the ConnectX API documentation",
            ))
            return GroundingVerification(checks=checks, grounded=False,
                                         summary="Endpoint does not exist in documentation.")

        checks += self.verify_path_params(plan, ep)
        checks += self.verify_query_params(plan, ep)
        checks += self.verify_query_string(query, ep)
        checks += self.verify_expected_fields(plan, ep)
        if unsupported_fields:
            checks += self.verify_unsupported_fields(unsupported_fields)

        grounded = all(c.status != "violation" for c in checks)
        summary = "All plan items verified against the documentation."
        if any(c.status == "warning" for c in checks):
            summary = "Plan verified with warnings; review documented alternatives before implementation."
        if not grounded:
            summary = f"{sum([c.status == 'violation' for c in checks])} violation(s) found; plan must be revised."
        return GroundingVerification(checks=checks, grounded=grounded, summary=summary)