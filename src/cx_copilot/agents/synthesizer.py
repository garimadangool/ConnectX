"""Agent 5: Plan Synthesizer — merges the pipeline's outputs into the final
IntegrationPlan, including limitations, unsupported requirements, and the
developer review checklist.
"""

from __future__ import annotations

from ..core.coerce import as_dict_list, as_list
from ..core.schemas import (
    IntegrationPlan,
    ParsedRequirement,
    ReviewChecklistItem,
    RequestParam,
)

SYSTEM_PROMPT = """\
You are a senior developer who writes integration plans that another developer
will review. You are given a parsed requirement, the grounded endpoint
matches, the API call design, and the constraint report.

Produce the final IntegrationPlan. Return JSON with EXACTLY these keys:
{
  "requirement_summary": "one sentence restating the business need",
  "recommended_endpoint": "GET /orders (the concrete call)",
  "operation_steps": ["step 1...", "step 2...", "..."],
  "authentication": "how the call is authenticated (X-API-Key header), without showing any credential",
  "pagination": "pagination strategy if needed, else 'not required for this volume'",
  "error_handling": ["how to handle the relevant errors"],
  "data_minimization": "what is retrieved vs what is actually needed",
  "limitations": ["honest limitations of this plan"],
  "unsupported_requirements": ["anything the API docs cannot provide"],
  "developer_review_checklist": [
     {"requirement": "thing to verify", "reason": "why a human must confirm"}
  ]
}

Rules:
- recommended_endpoint must derive from the grounded design (endpoint + path).
- Do NOT invent capabilities. Unsupported/limitation sections must be explicit.
- Keep authentication generic — never output any credential."""


class PlanSynthesizer:
    def __init__(self, llm):
        self.llm = llm

    def run(self, state: dict) -> IntegrationPlan:
        req: ParsedRequirement = state["parsed"]
        design = state["design"]
        constraints = state["constraints"]
        grounded = state.get("grounded")

        unsupported_grounded = list(grounded.unsupported_fields) if grounded else []

        prompt = (
            "PARSED REQUIREMENT:\n"
            f"{req.model_dump_json(indent=2)}\n\n"
            "API CALL DESIGN:\n"
            f"{design.model_dump_json(indent=2)}\n\n"
            "CONSTRAINT REPORT:\n"
            f"{constraints.model_dump_json(indent=2)}\n\n"
            "GROUNDING (documentation):\n"
            f"{grounded.model_dump_json(indent=2) if grounded else '{}'}"
            "\n\n"
            "DETERMINISTIC RULE: the grounding result above lists "
            "`unsupported_fields`. Every one of those MUST appear verbatim in "
            "your `unsupported_requirements` array — do NOT silently drop them, "
            "do NOT claim the plan is fully supported while any requested field "
            "is unsupported."
        )
        raw = self.llm.generate(prompt, system=SYSTEM_PROMPT, temperature=0.0)

        unsupported = as_list(raw.get("unsupported_requirements"))
        ungrounded_fields = {f.strip().strip("'\"") for f in unsupported_grounded}
        for f in unsupported_grounded:
            label = f if f.startswith(("'", '"')) else f"'{f}'"
            if not any(label in u for u in unsupported):
                unsupported.insert(0, f"{label} is not a documented response field")

        seen, deduped = set(), []
        for u in unsupported:
            bare = u.strip().strip("'\"")
            if bare in ungrounded_fields:
                continue
            key = bare.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(u)
        unsupported = deduped

        return IntegrationPlan(
            requirement_summary=raw.get("requirement_summary") or "",
            recommended_endpoint=raw.get("recommended_endpoint") or f"{design.method} {design.path}",
            operation_steps=as_list(raw.get("operation_steps")),
            params=list(design.params),
            example_request=design.example_request or "",
            authentication=raw.get("authentication") or "API key via X-API-Key header (never exposed).",
            pagination=raw.get("pagination") or "",
            error_handling=as_list(raw.get("error_handling")),
            expected_fields=design.expected_fields,
            data_minimization=raw.get("data_minimization") or "",
            limitations=as_list(raw.get("limitations")),
            unsupported_requirements=unsupported,
            developer_review_checklist=[
                ReviewChecklistItem(**c)
                for c in as_dict_list(raw.get("developer_review_checklist"), requirement="requirement", reason="reason")
                if c.get("requirement")
            ],
        )