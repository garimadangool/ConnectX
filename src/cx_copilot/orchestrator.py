"""Orchestrator — runs the agents as a LangGraph StateGraph.

LangGraph is used ONLY as a flow engine: nodes = agent runs, edges = typed
hand-offs, state = the Pydantic contracts. All agent logic stays in our own
code, so every step is explainable and unit-testable.

Every node also appends a human-readable trace to ``state["traces"]`` so the
FastAPI layer (Part 5) and the React/n8n demo surfaces can show the
step-by-step journey of a requirement.
"""

from __future__ import annotations

import time
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .agents.constraints import ConstraintEngine
from .agents.designer import IntegrationDesigner
from .agents.grounding import DocumentationGrounding
from .agents.interpreter import RequirementInterpreter
from .agents.scope import ScopeGuard
from .agents.synthesizer import PlanSynthesizer
from .core.schemas import (ApiCallDesign, ConstraintReport, GroundingResult,
                           GroundingVerification, IntegrationPlan,
                           ParsedRequirement)
from .core.validator import GroundingVerifier


class State(TypedDict, total=False):
    requirement_text: str
    parsed: ParsedRequirement
    grounded: GroundingResult
    design: ApiCallDesign
    constraints: ConstraintReport
    plan: IntegrationPlan
    grounded_ok: bool
    refused: bool
    refusal: str
    retries: int
    traces: list[dict]


def _trace(agent: str, node: str, payload: object, t0: float, status: str = "ok") -> dict:
    """Build one step record for the trace list."""
    try:
        detail = payload.model_dump() if hasattr(payload, "model_dump") else str(payload)
    except Exception:  # noqa: BLE001
        detail = str(payload)
    return {
        "agent": agent,
        "node": node,
        "status": status,
        "elapsed": round(time.time() - t0, 3),
        "detail": detail,
    }


def _step_update(state: State, payload: dict, trace: dict) -> dict:
    """Return a state update that carries the accumulated trace list with the node's payload."""
    return {**payload, "traces": list(state.get("traces", [])) + [trace]}


class Orchestrator:
    def __init__(
        self,
        scope,
        interpreter: RequirementInterpreter,
        grounding: DocumentationGrounding,
        designer: IntegrationDesigner,
        constraints: ConstraintEngine,
        synthesizer: PlanSynthesizer,
        verifier: GroundingVerifier,
        max_retries: int = 1,
    ):
        self.scope = scope
        self.interpreter = interpreter
        self.grounding = grounding
        self.designer = designer
        self.constraints = constraints
        self.synthesizer = synthesizer
        self.verifier = verifier
        self.max_retries = max_retries

    def build(self):
        g = StateGraph(State)

        def n_scope(s: State) -> dict:
            t0 = time.time()
            out = self.scope.run(s["requirement_text"])
            trace = _trace("Scope Guard", "scope", {"in_scope": out.in_scope}, t0)
            if not out.in_scope:
                return _step_update(s, {"refused": True, "refusal": out.refusal}, trace)
            return _step_update(s, {}, trace)

        def n_interpreter(s: State) -> dict:
            t0 = time.time()
            try:
                out = self.interpreter.run(s["requirement_text"])
                trace = _trace("Requirement Interpreter", "interpreter", out, t0)
                return _step_update(s, {"parsed": out}, trace)
            except Exception as e:  # noqa: BLE001
                trace = _trace("Requirement Interpreter", "interpreter", e, t0, status="error")
                raise

        def n_grounding(s: State) -> dict:
            t0 = time.time()
            try:
                out = self.grounding.run(s["parsed"])
                trace = _trace("Documentation Grounding", "grounding", out, t0)
                return _step_update(s, {"grounded": out}, trace)
            except Exception as e:  # noqa: BLE001
                trace = _trace("Documentation Grounding", "grounding", e, t0, status="error")
                raise

        def n_refusal(s: State) -> dict:
            t0 = time.time()
            msg = s.get("refusal") or "Off-topic request."
            plan = IntegrationPlan(
                requirement_summary=s.get("requirement_text", ""),
                recommended_endpoint="",
                unsupported_requirements=[msg],
                verification=GroundingVerification(
                    grounded=False,
                    summary=msg,
                    checks=[],
                ),
            )
            trace = _trace("Scope Guard", "scope", {"refused": True, "reason": msg}, t0)
            return _step_update(s, {"plan": plan, "grounded_ok": False}, trace)

        def n_designer(s: State) -> dict:
            t0 = time.time()
            try:
                out = self.designer.run(s["parsed"], s["grounded"])
                trace = _trace("Integration Designer", "designer", out, t0)
                return _step_update(
                    s,
                    {"design": out, "retries": s.get("retries", 0) + 1},
                    trace,
                )
            except Exception as e:  # noqa: BLE001
                trace = _trace("Integration Designer", "designer", e, t0, status="error")
                raise

        def n_constraints(s: State) -> dict:
            t0 = time.time()
            try:
                out = self.constraints.run(s["parsed"], s["design"])
                trace = _trace("Constraint Engine", "constraints", out, t0)
                return _step_update(s, {"constraints": out}, trace)
            except Exception as e:  # noqa: BLE001
                trace = _trace("Constraint Engine", "constraints", e, t0, status="error")
                raise

        def n_synthesizer(s: State) -> dict:
            t0 = time.time()
            try:
                out = self.synthesizer.run(s)
                trace = _trace("Plan Synthesizer", "synthesizer", out, t0)
                return _step_update(s, {"plan": out}, trace)
            except Exception as e:  # noqa: BLE001
                trace = _trace("Plan Synthesizer", "synthesizer", e, t0, status="error")
                raise

        def n_verifier(s: State) -> dict:
            t0 = time.time()
            plan: IntegrationPlan = s["plan"]
            unsupported = list(s["grounded"].unsupported_fields)
            verification = self.verifier.verify(plan, unsupported_fields=unsupported)
            plan = plan.model_copy(update={"verification": verification})
            traced = _trace("Grounding Verifier", "verifier", verification, t0)
            return _step_update(s, {"plan": plan, "grounded_ok": verification.grounded}, traced)

        g.add_node("scope", n_scope)
        g.add_node("refusal", n_refusal)
        g.add_node("interpreter", n_interpreter)
        g.add_node("grounding", n_grounding)
        g.add_node("designer", n_designer)
        g.add_node("constraints", n_constraints)
        g.add_node("synthesizer", n_synthesizer)
        g.add_node("verifier", n_verifier)

        g.add_edge(START, "scope")
        g.add_conditional_edges(
            "scope",
            lambda s: "refusal" if s.get("refused", False) else "interpreter",
            {"refusal": "refusal", "interpreter": "interpreter"},
        )
        g.add_edge("refusal", END)
        g.add_edge("interpreter", "grounding")
        g.add_edge("grounding", "designer")
        g.add_edge("designer", "constraints")
        g.add_edge("constraints", "synthesizer")
        g.add_edge("synthesizer", "verifier")
        g.add_conditional_edges(
            "verifier",
            lambda s: "designer"
            if (not s.get("grounded_ok", False)) and s.get("retries", 0) < self.max_retries
            else END,
            {"designer": "designer", END: END},
        )
        return g.compile()