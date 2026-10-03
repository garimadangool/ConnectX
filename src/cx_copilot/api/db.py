"""SQLite persistence for the copilot's traceability trail.

Tables:
  requests     — one row per submitted requirement (POST /plan)
  agent_traces — one row per agent step (input/output/duration/status)
  plans        — the final IntegrationPlan as JSON + grounding verdict
  reviews      — developer review decisions on a plan (Part 5 review endpoint)

The brief demands traceability ("how information moves through the system"),
so nothing the orchestrator produces is discarded.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DEFAULT_DB = Path(__file__).resolve().parents[3] / "copilot.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path | None = None) -> Path:
    """Create tables if missing. Returns the resolved DB path."""
    path = Path(db_path) if db_path else _DEFAULT_DB
    conn = _connect(path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            requirement_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_traces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL REFERENCES requests(id),
            agent TEXT NOT NULL,
            node TEXT NOT NULL,
            status TEXT NOT NULL,
            elapsed REAL NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL REFERENCES requests(id),
            grounded INTEGER NOT NULL,
            summary TEXT,
            endpoint TEXT,
            plan_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT NOT NULL REFERENCES plans(id),
            decision TEXT NOT NULL,
            comment TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_traces_request ON agent_traces(request_id);
        CREATE INDEX IF NOT EXISTS idx_plans_request ON plans(request_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_plan ON reviews(plan_id);
        """
    )
    conn.commit()
    conn.close()
    return path


def save_request(db_path: Path, requirement_text: str) -> str:
    rid = uuid.uuid4().hex
    conn = _connect(db_path)
    conn.execute(
        "INSERT INTO requests (id, requirement_text, created_at) VALUES (?, ?, ?)",
        (rid, requirement_text, _now()),
    )
    conn.commit()
    conn.close()
    return rid


def save_trace(db_path: Path, request_id: str, trace: dict) -> None:
    conn = _connect(db_path)
    conn.execute(
        "INSERT INTO agent_traces (request_id, agent, node, status, elapsed, detail, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            request_id,
            trace.get("agent", ""),
            trace.get("node", ""),
            trace.get("status", ""),
            trace.get("elapsed", 0.0),
            json.dumps(trace.get("detail"), ensure_ascii=False) if trace.get("detail") else None,
            _now(),
        ),
    )
    conn.commit()
    conn.close()


def save_plan(db_path: Path, request_id: str, plan: dict, grounded: bool) -> str:
    pid = uuid.uuid4().hex
    conn = _connect(db_path)
    conn.execute(
        "INSERT INTO plans (id, request_id, grounded, summary, endpoint, plan_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            pid,
            request_id,
            1 if grounded else 0,
            plan.get("requirement_summary") or "",
            plan.get("recommended_endpoint") or "",
            json.dumps(plan, ensure_ascii=False),
            _now(),
        ),
    )
    conn.commit()
    conn.close()
    return pid


def save_review(db_path: Path, plan_id: str, decision: str, comment: str = "") -> None:
    conn = _connect(db_path)
    conn.execute(
        "INSERT INTO reviews (plan_id, decision, comment, created_at) VALUES (?, ?, ?, ?)",
        (plan_id, decision, comment, _now()),
    )
    conn.commit()
    conn.close()


def get_request(db_path: Path, request_id: str) -> dict | None:
    conn = _connect(db_path)
    row = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_plan_full(db_path: Path, plan_id: str) -> dict | None:
    """Return the plan + its request + traces + reviews, or None."""
    conn = _connect(db_path)
    plan = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if plan is None:
        conn.close()
        return None
    request = conn.execute("SELECT * FROM requests WHERE id = ?", (plan["request_id"],)).fetchone()
    traces = conn.execute(
        "SELECT agent, status, elapsed, detail FROM agent_traces WHERE request_id = ? ORDER BY id",
        (plan["request_id"],),
    ).fetchall()
    reviews = conn.execute("SELECT decision, comment, created_at FROM reviews WHERE plan_id = ?", (plan_id,)).fetchall()
    conn.close()
    out = dict(plan)
    out["request"] = dict(request) if request else None
    out["traces"] = [dict(t) for t in traces]
    out["reviews"] = [dict(r) for r in reviews]
    return out


def get_recent_plans(db_path: Path, limit: int = 20) -> list[dict]:
    conn = _connect(db_path)
    rows = conn.execute(
        """
        SELECT p.id, p.request_id, p.grounded, p.summary, p.endpoint, p.created_at,
               (
                   SELECT r.decision FROM reviews r
                   WHERE r.plan_id = p.id
                   ORDER BY r.id DESC LIMIT 1
               ) AS review_status
        FROM plans p
        ORDER BY p.created_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]