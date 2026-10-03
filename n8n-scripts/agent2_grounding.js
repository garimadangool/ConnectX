// ---- Agent 2: Documentation Grounding (DETERMINISTIC - matches Python grounding.py) ----
// FIX: Agent 1's output is { output: "<json string>" } (observed in your real run).
// Unwrap + JSON.parse it BEFORE reading data_fields/filters. Nothing else changed.

const KB = {
  "api": {
    "name": "ConnectX Orders API",
    "base_url": "https://api.connectx.demo/v1",
    "auth": { "type": "api_key", "header_name": "X-API-Key" },
    "rate_limit": "Maximum 100 requests per minute",
    "pagination": "List Orders returns max 50 records per request"
  },
  "endpoints": [
    {
      "id": "get_single_order", "method": "GET", "path": "/orders/{order_id}",
      "path_params": [{"name": "order_id", "required": true}],
      "query_params": [],
      "response_fields": [
        {"name": "order_id"}, {"name": "customer_id"}, {"name": "created_at"},
        {"name": "status"}, {"name": "payment_status"}, {"name": "total"},
        {"name": "currency"}, {"name": "items", "nested": [
          {"name": "product_id"}, {"name": "name"}, {"name": "quantity"}, {"name": "unit_price"}
        ]}
      ]
    },
    {
      "id": "list_orders", "method": "GET", "path": "/orders",
      "path_params": [],
      "query_params": [
        {"name": "start_date"}, {"name": "end_date"}, {"name": "status"},
        {"name": "customer_id"}, {"name": "page"}, {"name": "limit"}
      ],
      "response_fields": [
        {"name": "page"}, {"name": "limit"}, {"name": "total_records"},
        {"name": "orders", "nested": [
          {"name": "order_id"}, {"name": "customer_id"}, {"name": "created_at"},
          {"name": "status"}, {"name": "payment_status"}, {"name": "total"}, {"name": "currency"}
        ]}
      ]
    },
    {
      "id": "get_customer", "method": "GET", "path": "/customers/{customer_id}",
      "path_params": [{"name": "customer_id", "required": true}],
      "query_params": [],
      "response_fields": [
        {"name": "customer_id"}, {"name": "name"}, {"name": "email"}, {"name": "customer_since"}
      ]
    },
    {
      "id": "get_order_delivery", "method": "GET", "path": "/orders/{order_id}/delivery",
      "path_params": [{"name": "order_id", "required": true}],
      "query_params": [],
      "response_fields": [
        {"name": "order_id"}, {"name": "delivery_status"}, {"name": "carrier"},
        {"name": "tracking_reference"}, {"name": "estimated_delivery"}
      ]
    }
  ]
};

function unwrap(nodeName) {
  const item = $('' + nodeName).first().json;
  // shapes: { output: "<json string>" }  |  { output: <object> }  |  <object>
  if (item && typeof item === 'object') {
    if (typeof item.output === 'string') {
      try { return JSON.parse(item.output.trim().replace(/^```(?:json)?\s*/gm, '').replace(/```$/gm, '')); }
      catch (e) {
        const start = item.output.indexOf('{');
        const end = item.output.lastIndexOf('}');
        if (start === -1 || end === -1) return {};
        try { return JSON.parse(item.output.slice(start, end + 1)); }
        catch (e2) { return {}; }
      }
    }
    if (item.output && typeof item.output === 'object') return item.output;
    return item;
  }
  return item || {};
}

// Read Agent 1's unwrapped parsed output
const parsed = unwrap('Agent 1: Requirement Interpreter') || {};
const dataFields = parsed.data_fields || [];
const filterFields = (parsed.filters || []).map(f => f.field).filter(Boolean);
const requested = [...new Set([...dataFields, ...filterFields])];

const SYNONYMS = {
  "order id": "order_id", "order number": "order_id", "order": "order_id",
  "customer id": "customer_id", "customer number": "customer_id", "customer": "customer_id",
  "date": "created_at", "order date": "created_at", "created date": "created_at", "creation date": "created_at",
  "completed date": "created_at", "completion date": "created_at",
  "status": "status", "order status": "status", "order state": "status",
  "payment status": "payment_status",
  "total amount": "total", "order total": "total", "total": "total", "amount": "total",
  "items": "items", "delivery status": "delivery_status",
  "delivered date": null, "delivery address": null, "shipping address": null,
  "name": "name", "email": "email",
  "unit price": "unit_price", "product id": "product_id", "quantity": "quantity"
};

function flatten(ep) {
  const out = [];
  for (const f of (ep.response_fields || [])) {
    out.push(f.name);
    for (const n of (f.nested || [])) out.push(n.name);
  }
  return out;
}

function allDocFields() {
  const out = new Set();
  for (const ep of KB.endpoints) for (const n of flatten(ep)) out.add(n);
  return out;
}

function normalize(s) {
  return String(s).toLowerCase().trim().replace(/_/g, ' ').split(/\s+/).join(' ');
}

// Real similarity (Dice coefficient on bigrams) so fuzzy matching actually works.
function bigrams(str) {
  const s = ' ' + str + ' ';
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.substring(i, i + 2));
  return out;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function resolve(requestedName) {
  const norm = normalize(requestedName);
  if (norm in SYNONYMS) {
    const val = SYNONYMS[norm];
    if (val === null) return [null, 'not a documented response field'];
    return [val, val !== norm ? `mapped '${requestedName}' to documented field '${val}'` : 'exact synonym match'];
  }
  let best = null, bestScore = 0;
  for (const name of allDocFields()) {
    const score = similarity(norm, normalize(name));
    if (score > bestScore) { best = name; bestScore = score; }
  }
  if (best !== null && bestScore >= 0.85) return [best, `fuzzy match (${bestScore.toFixed(2)}): '${best}'`];
  return [null, 'no documented response field matches'];
}

const mappings = [];
const unsupported = [];
const ambiguities = [];

for (const name of requested) {
  const [doc, note] = resolve(name);
  mappings.push({ requested: name, documented: doc, matched: doc !== null, note });
  if (doc === null) {
    unsupported.push(name);
  } else if (name !== doc) {
    ambiguities.push(`Requested '${name}' is not a documented field; mapped to documented field '${doc}'.`);
  }
}

const supported = new Set(mappings.filter(m => m.matched && m.documented).map(m => m.documented));

const scored = [];
for (const ep of KB.endpoints) {
  const fields = new Set(flatten(ep));
  const hits = [...supported].filter(f => fields.has(f));
  scored.push({ count: hits.length, ep, fields });
}
scored.sort((a, b) => b.count - a.count);

const matched = [];
for (const { count, ep, fields } of scored) {
  if (count === 0) continue;
  const epMappings = mappings.filter(m => m.matched && fields.has(m.documented));
  matched.push({
    endpoint_id: ep.id,
    method: ep.method,
    path: ep.path,
    relevance: `exposes ${count} requested field(s): ${[...fields].filter(f => supported.has(f)).join(', ')}`,
    field_mappings: epMappings,
    unsupported_fields: [...unsupported]
  });
}

const notes = [];
if (unsupported.length) notes.push('Unsupported field(s): ' + unsupported.join(', '));
if (ambiguities.length) notes.push(...ambiguities);

return [{ json: { matched_endpoints: matched, unsupported_fields: unsupported, ambiguities, notes } }];