"""ConnectX Integration Copilot — FastAPI backend (Part 5).

Endpoints:
  POST /plan                 — run the full multi-agent pipeline on a requirement,
                               persist everything, return plan + agent traces.
  GET  /plans/{plan_id}      — fetch a stored plan with its traces, request, reviews.
  GET  /plans                — recent plans (for the React dashboard listing).
  POST /plans/{plan_id}/review — developer review decision (approved/rejected).

Provider for the LLM is read from LLM_PROVIDER in .env (ollama | groq) and can be
overridden per-request with {"provider": "groq"} for the demo.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cx_copilot.core.narrative import render_plan_narrative
from cx_copilot.core.schemas import GroundingVerification, IntegrationPlan, RequestParam
from cx_copilot.agents.constraints import ConstraintEngine
from cx_copilot.agents.designer import IntegrationDesigner
from cx_copilot.agents.grounding import DocumentationGrounding
from cx_copilot.agents.interpreter import RequirementInterpreter
from cx_copilot.agents.scope import ScopeGuard
from cx_copilot.agents.synthesizer import PlanSynthesizer
from cx_copilot.core.llm_client import LLMClient
from cx_copilot.core.validator import GroundingVerifier, load_knowledge_base
from cx_copilot.n8n_bridge import run_n8n_plan
from cx_copilot.orchestrator import Orchestrator

from . import db as storage

app = FastAPI(title="ConnectX Integration Copilot", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_DB = storage.init_db()


class PlanRequest(BaseModel):
    requirement_text: str = Field(..., min_length=1)
    provider: str | None = None  # override LLM_PROVIDER per request (demo)
    engine: str | None = None  # "n8n" forces the n8n (Docker) workflow route


class ReviewRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    comment: str = ""


def _n8n_webhook_url() -> str | None:
    url = os.getenv("N8N_WEBHOOK_URL", "").strip()
    return url or None


def _build_orchestrator(kb: dict, provider: str | None):
    llm = LLMClient(provider=provider) if provider else LLMClient()
    return Orchestrator(
        scope=ScopeGuard(),
        interpreter=RequirementInterpreter(llm),
        grounding=DocumentationGrounding(llm, kb),
        designer=IntegrationDesigner(llm, kb),
        constraints=ConstraintEngine(kb),
        synthesizer=PlanSynthesizer(llm),
        verifier=GroundingVerifier(kb),
    ).build()


@app.post("/plan")
def create_plan(req: PlanRequest):
    provider = req.provider or "ollama"

    kb = load_knowledge_base()
    graph = _build_orchestrator(kb, provider)

    n8n_url = _n8n_webhook_url()
    force_n8n = req.engine == "n8n"
    if force_n8n and not n8n_url:
        n8n_url = "http://localhost:5678/webhook/copilot-trigger"

    n8n_result = None
    if n8n_url and (provider == "ollama" or force_n8n):
        try:
            n8n_result = run_n8n_plan(req.requirement_text.strip(), n8n_url)
        except Exception as e:  # noqa: BLE001
            if force_n8n:
                raise HTTPException(
                    status_code=502,
                    detail=f"n8n (Docker) workflow unavailable ({type(e).__name__}: {e}). "
                    "Is `docker compose up -d` running and is the workflow active?",
                ) from e
            print(f"[n8n] workflow unavailable ({type(e).__name__}: {e}); falling back to Python pipeline")
            n8n_result = None

    request_id = storage.save_request(_DB, req.requirement_text.strip())

    grounded = False

    if n8n_result:
        plan_dict = n8n_result["plan_json"]
        n8n_grounded = n8n_result["grounded_ok"]
        narrative = n8n_result["narrative"]
        traces = n8n_result["traces"]
        engine = "n8n"

        try:
            ep_str = plan_dict.get("recommended_endpoint") or ""
            method_p, _, path_p = ep_str.partition(" ")
            params_dicts = plan_dict.get("params") or []
            ef = plan_dict.get("expected_fields") or []
            unsupported = (
                plan_dict.get("unsupported_requirements")
                or plan_dict.get("unsupported_items")
                or plan_dict.get("unsupported_fields")
                or []
            )
            synth = IntegrationPlan(
                requirement_summary=plan_dict.get("requirement_summary", ""),
                recommended_endpoint=ep_str,
                params=[RequestParam(**p) if isinstance(p, dict) else p for p in params_dicts],
                expected_fields=ef,
                unsupported_requirements=unsupported,
                verification=GroundingVerification(grounded=n8n_grounded, summary="re-verified by backend"),
            )
            reverified = GroundingVerifier(kb).verify(synth, unsupported_fields=unsupported)
            grounded = bool(reverified.grounded)
            plan_dict["verification"] = reverified.model_dump(mode="json")
            plan_dict["unsupported_requirements"] = unsupported
            narrative = render_plan_narrative(plan_dict) if "CONNECTX INTEGRATION PLAN" not in narrative else narrative
        except Exception as e:  # noqa: BLE001
            print(f"[re-verify] skipped ({type(e).__name__}: {e})")
            grounded = n8n_grounded
    else:
        try:
            result = graph.invoke({"requirement_text": req.requirement_text.strip()})
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e

        plan = result["plan"]
        plan_dict = plan.model_dump(mode="json")
        grounded = bool(result.get("grounded_ok"))
        narrative = render_plan_narrative(plan_dict)
        traces = result.get("traces", [])
        engine = "python"

    for trace in traces:
        storage.save_trace(_DB, request_id, trace)
    plan_id = storage.save_plan(_DB, request_id, plan_dict, grounded)

    return {
        "plan_id": plan_id,
        "request_id": request_id,
        "grounded_ok": grounded,
        "engine": engine,
        "narrative": narrative,
        "plan": plan_dict,
        "traces": traces,
    }


@app.get("/plans")
def list_plans(limit: int = 20):
    return {"plans": storage.get_recent_plans(_DB, limit=limit)}


@app.get("/plans/{plan_id}")
def get_plan(plan_id: str):
    full = storage.get_plan_full(_DB, plan_id)
    if full is None:
        raise HTTPException(status_code=404, detail="plan not found")
    full["plan_json"] = __import__("json").loads(full["plan_json"])
    return full


@app.post("/plans/{plan_id}/review")
def review_plan(plan_id: str, req: ReviewRequest):
    full = storage.get_plan_full(_DB, plan_id)
    if full is None:
        raise HTTPException(status_code=404, detail="plan not found")
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be 'approved' or 'rejected'")
    storage.save_review(_DB, plan_id, req.decision, req.comment)
    return {
        "plan_id": plan_id,
        "decision": req.decision,
        "comment": req.comment,
        "message": f"Plan {req.decision} by developer review.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))