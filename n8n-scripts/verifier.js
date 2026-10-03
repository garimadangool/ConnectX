// ---- Verifier (after Agent 5: Plan Synthesizer) ----
// FIX: read structured output from top-level .json (proven pattern).
// LOOP ROOT CAUSE: reading `.json.output` returned undefined, so
// plan.recommended_endpoint was undefined -> always "endpoint does not exist"
// -> grounded:false -> IF Grounded sent you back to Agent 3 forever.
// FIX 2: also validate the GATE output (the concrete API call), because the
// final params + expected_fields are determined there, not by Agent 5's prose.

const KB = {
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

function flatten(ep) {
  const out = [];
  for (const f of (ep.response_fields || [])) {
    out.push(f.name);
    for (const n of (f.nested || [])) out.push(n.name);
  }
  return out;
}

function endpointExists(method, path) {
  for (const ep of KB.endpoints) {
    if (ep.method.toUpperCase() === method.toUpperCase() && ep.path.replace(/\//g, '') === path.replace(/\//g, '')) return ep;
  }
  return null;
}

function endpointById(id) {
  return KB.endpoints.find(e => e.id === id) || null;
}

function grab(nodeName) {
  const item = $(nodeName).first().json;
  if (item && typeof item === 'object') {
    if (typeof item.output === 'string') {
      const s = item.output.trim();
      try { return JSON.parse(s); } catch (e) {}
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) { try { return JSON.parse(fence[1].trim()); } catch (e2) {} }
      const start = s.indexOf('{');
      const end = s.lastIndexOf('}');
      if (start > -1 && end > start) {
        try { return JSON.parse(s.slice(start, end + 1)); } catch (e3) {}
      }
      return s;
    }
    if (item.output && typeof item.output === 'object') return item.output;
    return item;
  }
  return item;
}

const plan = grab('Agent 5: Plan Synthesizer') || {};
const gate = grab('Gate Validation') || {};
const checks = [];

// Endpoint: prefer the Gate's decision (filtered against grounded matches).
const gateEndpointId = gate.endpoint_id || '';
const gateEp = endpointById(gateEndpointId);
if (!gateEp) {
  checks.push({ item: 'endpoint', checked_against: 'knowledge base', status: 'violation',
    detail: `Gate endpoint '${gateEndpointId}' is not in the ConnectX API documentation` });
  return [{ json: { checks, grounded: false, summary: 'Endpoint does not exist in documentation.' } }];
}
const epById = gateEp;

// Params: use the Gate's params (already filtered + enriched by the Gate).
const providedPath = (gate.params || []).filter(p => p.location === 'path').map(p => p.name);
for (const req of (epById.path_params || [])) {
  if (req.required && !providedPath.includes(req.name)) {
    checks.push({ item: `path param ${req.name}`, checked_against: epById.id, status: 'violation',
      detail: `required path parameter '${req.name}' is missing from the plan` });
  }
}

const allowedQuery = new Set((epById.query_params || []).map(p => p.name));
for (const p of (gate.params || [])) {
  if (p.location === 'query' && !allowedQuery.has(p.name)) {
    checks.push({ item: `query param ${p.name}`, checked_against: epById.id, status: 'violation',
      detail: `'${p.name}' is not a documented query parameter of ${epById.id}` });
  }
}

// Response fields: use the Gate's expected_fields (already mapped to documented names).
const validFields = new Set(flatten(epById));
for (const f of (gate.expected_fields || [])) {
  if (!validFields.has(f)) {
    checks.push({ item: `response field ${f}`, checked_against: epById.id, status: 'violation',
      detail: `'${f}' is not a documented response field of ${epById.id}` });
  }
}

// Cross-check Agent 5's recommended endpoint agrees with the Gate endpoint.
if (plan.recommended_endpoint) {
  const raw = plan.recommended_endpoint || '';
  const [method, ...rest] = raw.split(' ');
  const path = (rest.join(' ') || '').split('?')[0];
  const planEp = endpointExists(method, path) || endpointById(method && endpointById(method) ? method : '');
  if (!planEp) {
    checks.push({ item: 'plan endpoint', checked_against: 'knowledge base', status: 'warning',
      detail: `Agent 5 used '${plan.recommended_endpoint}' which is not in the documentation` });
  } else if (planEp.id !== epById.id) {
    checks.push({ item: 'endpoint agreement', checked_against: epById.id, status: 'warning',
      detail: `Plan recommended ${planEp.id} but Gate selected ${epById.id}` });
  }
}

const grounded = !checks.some(c => c.status === 'violation');
let summary = 'All plan items verified against the documentation.';
if (checks.some(c => c.status === 'warning')) summary = 'Plan verified with warnings.';
if (!grounded) summary = `${checks.filter(c => c.status === 'violation').length} violation(s) found; plan must be revised.`;

return [{ json: { checks, grounded, summary } }];