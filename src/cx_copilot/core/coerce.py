"""Helpers to coerce messy LLM output into clean Python types.

Real models sometimes return a bare string for what we asked to be a list
(e.g. data_fields: "order_id" instead of ["order_id"]). These helpers make
the agents resilient without throwing away the data.
"""

from __future__ import annotations


def as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        return list(value.keys())
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return [value]


def as_dict_list(source, **defaults) -> list[dict]:
    """Normalise to a list of dicts, filling in default keys when missing."""
    out: list[dict] = []
    for item in as_list(source):
        if isinstance(item, dict):
            out.append({**defaults, **item})
        elif isinstance(item, str) and defaults.get("field"):
            out.append({**defaults, "field": item})
    return out


def as_str(value, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value).strip()


def normalise_scope(value) -> str:
    """Map any LLM scope string to the allowed enum, sensible default."""
    text = as_str(value, "").lower()
    if "single" in text:
        return "single_record"
    if "summary" in text or "report" in text or "aggregate" in text:
        return "summary_or_report"
    return "multiple_records"