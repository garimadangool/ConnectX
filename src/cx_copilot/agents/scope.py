"""Scope Guard — deterministic, no-LLM off-topic gate.

Rejects greetings / irrelevant chat ("hello", "what day is today", …) before any
LLM runs. Mirrors n8n-scripts/scope_guard.js; keeps the Python orchestrator and
the n8n workflow behaviourally identical.
"""

from __future__ import annotations

from dataclasses import dataclass

# Substrings that indicate the message is a ConnectX integration request.
KEYWORDS = (
    "order", "customer", "api", "pull", "retrieve", "fetch", "get",
    "sync", "report", "integration", "data", "status", "payment",
    "delivery", "ship", "track", "reconcil", "summary", "list",
    "monitor", "query", "support", "finance", "operations", "audit",
    "revenue", "dispatch", "profile", "logistics",
)

REFUSAL = (
    "I can only help with ConnectX Orders API integration requests. "
    "Please describe what order, customer, or delivery data you need."
)


@dataclass
class ScopeResult:
    in_scope: bool
    refusal: str = REFUSAL


class ScopeGuard:
    def run(self, requirement_text: str) -> ScopeResult:
        text = requirement_text.strip()
        lower = text.lower()
        has_keyword = any(k in lower for k in KEYWORDS)
        has_minimum_length = len(text.split()) >= 3
        return ScopeResult(in_scope=has_keyword and has_minimum_length)