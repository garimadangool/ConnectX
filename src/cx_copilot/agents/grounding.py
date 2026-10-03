"""Agent 2: Documentation Grounding — deterministic field/endpoint resolution
against the knowledge base.

Why deterministic (no LLM):
  Grounding is the anti-hallucination layer. Trusting a generation model to
  decide what the documentation supports would reintroduce exactly the failure
  this system exists to prevent. Field names are resolved through a controlled
  synonym + fuzzy-match step; endpoint selection is a pure lookup against the
  documented response fields. Fully unit-testable, never invents anything.
"""

from __future__ import annotations

from difflib import SequenceMatcher

from ..core.schemas import EndpointMatch, FieldMapping, GroundingResult, ParsedRequirement

# natural-language label -> canonical documented field name
SYNONYMS = {
    "order id": "order_id",
    "order number": "order_id",
    "order": "order_id",
    "customer id": "customer_id",
    "customer number": "customer_id",
    "customer": "customer_id",
    "date": "created_at",
    "order date": "created_at",
    "created date": "created_at",
    "creation date": "created_at",
    "status": "status",
    "order status": "status",
    "order state": "status",
    "payment status": "payment_status",
    "total amount": "total",
    "order total": "total",
    "total": "total",
    "amount": "total",
    "items": "items",
    "delivery status": "delivery_status",
    "delivered date": None,  # not documented
    "completed date": None,  # NOT a documented field (closest: created_at)
    "completion date": None,
    "delivery address": None,  # no address field exists anywhere
    "shipping address": None,
    "name": "name",
    "email": "email",
    "unit price": "unit_price",
    "product id": "product_id",
    "quantity": "quantity",
}


class DocumentationGrounding:
    def __init__(self, llm=None, kb: dict | None = None):
        self.kb = kb

    # -- helpers ----------------------------------------------------------
    def _normalise(self, s: str) -> str:
        return " ".join(s.lower().strip().replace("_", " ").split())

    def _resolve(self, requested: str) -> tuple[str | None, str]:
        """Returns (documented_field, note). None => unsupported."""
        norm = self._normalise(requested)
        if norm in SYNONYMS:
            value = SYNONYMS[norm]
            if value is None:
                return None, "not a documented response field"
            return value, "exact synonym match"
        best, score, best_name = None, 0.0, norm
        for name in self._all_documented_fields():
            ratio = SequenceMatcher(None, norm, self._normalise(name)).ratio()
            if ratio > score:
                best, score, best_name = name, ratio, name
        if best is not None and score >= 0.85:
            return best, f"fuzzy match (0.85+): '{best_name}'"
        return None, "no documented response field matches"

    def _all_documented_fields(self) -> set[str]:
        out: set[str] = set()
        for ep in self.kb["endpoints"]:
            out |= set(self._flatten(ep))
        return out

    def _flatten(self, ep: dict) -> list[str]:
        """All matchable field names for an endpoint as BARE names.

        Nested fields (e.g. list item fields) are returned without a prefix so
        they align with the verifier's documented-field set. A requested
        "order_id" therefore matches both get_single_order.order_id and the
        orders[] items of list_orders.
        """
        out = []
        for f in ep.get("response_fields", []):
            out.append(f["name"])
            for n in f.get("nested", []):
                out.append(n["name"])
        return out

    # -- main ---------------------------------------------------------------
    def run(self, req: ParsedRequirement) -> GroundingResult:
        requested = list(dict.fromkeys(list(req.data_fields) + [f.field for f in req.filters if f.field]))
        mappings: list[FieldMapping] = []
        unsupported: list[str] = []
        ambiguities: list[str] = []

        for name in requested:
            doc, note = self._resolve(name)
            mappings.append(FieldMapping(requested=name, documented=doc, matched=doc is not None, note=note))
            if doc is None:
                unsupported.append(name)
                if "completed" in name and "date" in name:
                    ambiguities.append(
                        "no 'completed_date' field exists; closest documented field is 'created_at' "
                        "— developer must confirm it is acceptable."
                    )

        supported = {m.documented for m in mappings if m.matched and m.documented}

        # score every endpoint by how many supported fields it exposes
        scored: list[tuple[int, dict, set[str]]] = []
        for ep in self.kb["endpoints"]:
            fields = set(self._flatten(ep))
            hit = supported & fields
            scored.append((len(hit), ep, fields))

        scored.sort(key=lambda t: -t[0])
        matched: list[EndpointMatch] = []
        for count, ep, fields in scored:
            if count == 0:
                continue
            ep_mappings = [m for m in mappings if m.matched and m.documented in fields]
            matched.append(
                EndpointMatch(
                    endpoint_id=ep["id"],
                    method=ep["method"],
                    path=ep["path"],
                    relevance=f"exposes {count} requested field(s): {', '.join(sorted(fields & supported))}",
                    field_mappings=ep_mappings,
                    unsupported_fields=list(unsupported),
                )
            )

        notes = []
        if unsupported:
            notes.append("Unsupported field(s): " + ", ".join(unsupported))
        if ambiguities:
            notes.extend(ambiguities)

        return GroundingResult(
            matched_endpoints=matched,
            unsupported_fields=unsupported,
            ambiguities=ambiguities,
            notes=notes,
        )