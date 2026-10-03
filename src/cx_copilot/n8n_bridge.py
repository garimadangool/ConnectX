"""Bridge to the n8n production workflow (seventeen.json).

Routes a requirement into the n8n chat-trigger webhook and normalizes the
workflow's response back into the same shape the Python pipeline produces, so
the API layer, persistence, and React frontend are unchanged regardless of
which engine actually ran.

The webhook is a "When chat message received" (chatTrigger) node, which n8n
registers at  POST /webhook/<webhookId>  and accepts the n8n chat payload.
"""

from __future__ import annotations

import json
import time
import uuid

import httpx


def _first_item(body) -> dict:
    """Defensively extract the first item's `.json` from an n8n webhook body."""
    data = body
    if isinstance(data, dict):
        if isinstance(data.get("items"), list) and data["items"]:
            data = data["items"][0]
        elif isinstance(data.get("json"), dict):
            data = data["json"]
        elif "@data" in data and data["@data"]:  # some n8n versions wrap metadata
            data = data["@data"][0] if isinstance(data["@data"], list) else data["@data"]
    if isinstance(data, list):
        data = data[0] if data else {}
    if isinstance(data, dict) and isinstance(data.get("json"), dict):
        data = data["json"]
    return data if isinstance(data, dict) else {}


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return []
    return value if isinstance(value, list) else [value]


def _parse_nested(item: dict, field: str):
    """n8n sometimes stores JSON objects as strings — parse on demand."""
    value = item.get(field)
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return value
    return value


def run_n8n_plan(requirement_text: str, webhook_url: str, timeout: float = 180.0) -> dict:
    """Call the n8n workflow and return a normalized plan bundle.

    Returns a dict shaped like the Python pipeline's `/plan` payload:
      {engine, plan_json, narrative, grounded_ok, traces}
    Raises RuntimeError on HTTP/timeout failures so the caller can fall back.
    """
    session_id = f"copilot-{uuid.uuid4().hex[:8]}"
    started = time.time()

    payload = {
        "action": "sendMessage",
        "sessionId": session_id,
        "chatInput": requirement_text,
    }

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(webhook_url, json=payload, params=payload)
        resp.raise_for_status()

    elapsed_ms = int((time.time() - started) * 1000)
    item = _first_item(resp.json())

    summary = item.get("summary") or ""
    grounded = None
    verifier = _parse_nested(item, "verifier")
    if isinstance(verifier, dict):
        grounded = verifier.get("grounded")
        summary = verifier.get("summary") or summary
    else:
        verifier = _parse_nested(item, "Verifier")
        if isinstance(verifier, dict):
            grounded = verifier.get("grounded")
            summary = verifier.get("summary") or summary

    endpoint_id = item.get("endpoint_id") or item.get("endpointId") or ""
    action = item.get("method") or item.get("action") or "GET"
    path = item.get("path") or item.get("endpoint") or ""
    if not path:
        endpoint_id = _parse_nested(item, "endpoint_id") or _parse_nested(item, "endpointId") or ""

    params = None
    gate = _parse_nested(item, "gate")
    if isinstance(gate, dict):
        params = gate.get("params")
        if not endpoint_id:
            endpoint_id = gate.get("endpoint_id") or ""
    if params is None:
        gate = _parse_nested(item, "Gate Validation")
        if isinstance(gate, dict):
            params = gate.get("params")
            if not endpoint_id:
                endpoint_id = gate.get("endpoint_id") or ""
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except (TypeError, json.JSONDecodeError):
            params = None

    expected_fields = item.get("expected_fields")
    if expected_fields is None:
        gate = _parse_nested(item, "Gate Validation")
        if isinstance(gate, dict):
            expected_fields = gate.get("expected_fields")
    if expected_fields is None:
        gate = _parse_nested(item, "gate")
        if isinstance(gate, dict):
            expected_fields = gate.get("expected_fields")
    if isinstance(expected_fields, str):
        try:
            expected_fields = json.loads(expected_fields)
        except (TypeError, json.JSONDecodeError):
            expected_fields = None

    if endpoint_id:
        method, _, remainder = endpoint_id.partition(" ")
        if not remainder:
            path = f"/orders/{endpoint_id}"
        else:
            path = remainder.split("?")[0]
            endpoint_id = f"{method} {path}"
            if method in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                action = method

    agent5_output = {}
    if not agent5_output:
        agent5_output = _parse_nested(item, "output")
    if isinstance(agent5_output, str):
        try:
            agent5_output = json.loads(agent5_output)
        except (TypeError, json.JSONDecodeError):
            agent5_output = None
    if not isinstance(agent5_output, dict):
        agent5_output = {}

    raw_traces = item.get("traces") or item.get("agent_traces") or ""
    if isinstance(raw_traces, str):
        try:
            raw_traces = json.loads(raw_traces)
        except (TypeError, json.JSONDecodeError):
            raw_traces = []
    raw_traces = raw_traces if isinstance(raw_traces, list) else []

    agent_map = {}
    for t in raw_traces:
        if isinstance(t, dict) and t.get("agent"):
            entry = t
            out = t.get("output")
            if isinstance(out, str):
                try:
                    out = json.loads(out)
                except (TypeError, json.JSONDecodeError):
                    pass
            agent_map[t["agent"]] = out if isinstance(out, dict) else {"output": out}

    gate_out = agent_map.get("Gate Validation") or {}
    designer_out = agent_map.get("Integration Designer") or {}
    synth_out = agent_map.get("Plan Synthesizer") or {}
    verifier_out = agent_map.get("Verifier") or {}
    verifier_out = verifier_out.get("output", verifier_out) if isinstance(verifier_out, dict) else verifier_out
    if not isinstance(verifier_out, dict):
        verifier_out = {}
    if grounded is None:
        grounded = verifier_out.get("grounded")
    else:
        grounded = grounded
    if not summary:
        summary = verifier_out.get("summary") or ""

    if params is None:
        params = gate_out.get("params") or (designer_out.get("params") or [])

    plan_json = {
        "requirement_summary": synth_out.get("requirement_summary")
        or agent5_output.get("requirement_summary")
        or item.get("requirement_summary")
        or requirement_text[:200],
        "recommended_endpoint": synth_out.get("recommended_endpoint")
        or item.get("recommended_endpoint")
        or (f"{action} {path}".strip() if path else ""),
        "operation_steps": _as_list(
            synth_out.get("operation_steps")
            or agent5_output.get("operation_steps")
            or item.get("operation_steps")
        ),
        "authentication": synth_out.get("authentication")
        or agent5_output.get("authentication")
        or item.get("authentication")
        or "",
        "pagination": synth_out.get("pagination")
        or agent5_output.get("pagination")
        or item.get("pagination")
        or "",
        "error_handling": _as_list(
            synth_out.get("error_handling")
            or agent5_output.get("error_handling")
            or item.get("error_handling")
        ),
        "expected_fields": _as_list(expected_fields or gate_out.get("expected_fields")),
        "data_minimization": synth_out.get("data_minimization")
        or agent5_output.get("data_minimization")
        or item.get("data_minimization")
        or "",
        "limitations": _as_list(
            synth_out.get("limitations")
            or agent5_output.get("limitations")
            or item.get("limitations")
        ),
        "unsupported_requirements": _as_list(
            synth_out.get("unsupported_requirements")
            or agent5_output.get("unsupported_requirements")
            or item.get("unsupported_requirements")
            or gate_out.get("unsupported_fields")
        ),
        "developer_review_checklist": _as_list(
            synth_out.get("developer_review_checklist")
            or agent5_output.get("developer_review_checklist")
            or item.get("developer_review_checklist")
        ),
        "params": [
            {
                "name": p.get("name"),
                "location": p.get("location") or "query",
                "value": p.get("value"),
                "required": bool(p.get("required", False)),
                "source": p.get("source") or "",
            }
            for p in _as_list(params)
            if isinstance(p, dict) and p.get("name")
        ],
        "verification": {
            "grounded": bool(grounded),
            "summary": summary,
            "checks": _as_list(verifier_out.get("checks") or item.get("checks") or item.get("problems")),
        },
    }

    narrative = item.get("plan") or item.get("narrative") or ""
    if not narrative or "CONNECTX INTEGRATION PLAN" not in narrative:
        from cx_copilot.core.narrative import render_plan_narrative

        narrative = render_plan_narrative(plan_json) if narrative else narrative

    traces = [
        {
            "agent": "n8n workflow (seventeen.json)",
            "output": f"Engine: n8n · grounded={bool(grounded)} · {elapsed_ms}ms",
            "elapsed_ms": elapsed_ms,
            "status": "ok",
        }
    ]

    return {
        "engine": "n8n",
        "plan_json": plan_json,
        "narrative": narrative,
        "grounded_ok": bool(grounded),
        "traces": traces,
    }