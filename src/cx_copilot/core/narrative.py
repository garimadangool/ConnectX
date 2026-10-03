"""Renders an IntegrationPlan as a readable English summary.

The Python equivalent of the deterministic "Build Final Response" node in
seventeen.json: it takes the structured plan object and turns it into plain text a
developer can read.
"""

from __future__ import annotations

from typing import Any


def render_plan_narrative(plan: dict[str, Any]) -> str:
    """Turn a plan dict into a human-readable integration narrative."""
    lines: list[str] = []
    add = lines.append

    add("CONNECTX INTEGRATION PLAN")
    add("=========================")

    summary = plan.get("requirement_summary") or plan.get("requirement_text") or ""
    if summary:
        add("")
        add(f"What you asked for: {summary}")

    endpoint = plan.get("recommended_endpoint") or plan.get("endpoint") or ""
    if endpoint:
        add("")
        add(f"Recommended API call: {endpoint}")

    auth = plan.get("authentication")
    if not auth and plan.get("verification"):
        auth = "API key via X-API-Key header (credentials never exposed)."
    if not auth:
        auth = "API key via X-API-Key header (credentials never exposed)."
    add("")
    add(f"Authentication: {auth}")

    params = plan.get("params") or []
    if params:
        add("")
        add("Parameters:")
        for p in params:
            name = p.get("name") or "?"
            loc = p.get("location") or ""
            value = p.get("value")
            if value is None or value == "":
                value = "to-be-filled"
            req = "required" if p.get("required") else "optional"
            source = p.get("source") or ""
            add(f"  - {name} ({loc}, {req}): {value}{f' — {source}' if source else ''}")
    else:
        add("")
        add("Parameters: none required for this call.")

    fields = plan.get("expected_fields") or []
    if fields:
        add("")
        add("Response fields to extract: " + ", ".join(fields) + ".")

    ops = plan.get("operation_steps") or []
    if ops:
        add("")
        add("Steps:")
        for i, step in enumerate(ops, 1):
            add(f"  {i}. {step}")

    pagination = plan.get("pagination") or ""
    if pagination:
        add("")
        add(f"Pagination: {pagination}")

    errors = plan.get("error_handling") or []
    if errors:
        add("")
        add("Error handling:")
        for e in errors:
            add(f"  - {e}")

    minimization = plan.get("data_minimization") or ""
    if minimization:
        add("")
        add(f"Data minimization: {minimization}")

    limits = plan.get("limitations") or []
    if limits:
        add("")
        add("Limitations:")
        for l_ in limits:
            add(f"  - {l_}")

    unsupported = (
        plan.get("unsupported_requirements")
        or plan.get("unsupported_items")
        or plan.get("unsupported_fields")
        or []
    )
    if unsupported:
        add("")
        add("Unsupported/invented items (not in the API docs):")
        for u in unsupported:
            add(f"  - {u}")

    verification = plan.get("verification") or {}
    grounded = verification.get("grounded")
    if grounded is None:
        grounded = plan.get("grounded")
    add("")
    if grounded:
        add("[grounded: true] Every endpoint, parameter, and field in the plan is supported by the documentation.")
    else:
        add("[grounded: false] The plan is NOT fully grounded in the documentation.")
        problems = verification.get("problems") or plan.get("problems") or []
        if problems:
            add("Problems identified:")
            for p in problems:
                add(f"  - {p}")
        checks = verification.get("checks") or []
        violations = [c for c in checks if isinstance(c, dict) and c.get("status") == "violation"]
        for c in violations:
            add(f"  * {c.get('item') or c.get('detail')}")

    checklist = plan.get("developer_review_checklist") or []
    if checklist:
        add("")
        add("Developer review checklist (human must confirm before the plan is used):")
        for item in checklist:
            if isinstance(item, dict):
                text = item.get("requirement") or item.get("item") or ""
                reason = item.get("reason") or ""
                add(f"  [ ] {text}{f' ({reason})' if reason else ''}")
            else:
                add(f"  [ ] {item}")

    return "\n".join(lines)