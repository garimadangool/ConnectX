// ---- Gate Validation (after Agent 3: Integration Designer) ----
// FIX: read structured output from top-level .json (matches the proven Agent 2
// pattern). Tolerant to .json.output shapes as well.
// FIX 2: after filtering out any non-documented params, ADD the documented
// params that the requirement actually calls for (dates for "previous day",
// status filter, customer_id filter) so the plan has real, grounded params.

const KB_ENDPOINTS = [
  { id: 'get_single_order', method: 'GET', path: '/orders/{order_id}',
    path_params: ['order_id'], query_params: [] },
  { id: 'list_orders', method: 'GET', path: '/orders',
    path_params: [], query_params: ['start_date','end_date','status','customer_id','page','limit'] },
  { id: 'get_customer', method: 'GET', path: '/customers/{customer_id}',
    path_params: ['customer_id'], query_params: [] },
  { id: 'get_order_delivery', method: 'GET', path: '/orders/{order_id}/delivery',
    path_params: ['order_id'], query_params: [] }
];

function grab(nodeName) {
  const item = $(nodeName).first().json;
  if (item && typeof item === 'object') {
    if (typeof item.output === 'string') {
      const s = item.output.trim();
      // try: plain JSON, then fenced JSON, then first{...last} substring
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

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// 1. Grounded matches from Agent 2 (never fall back to all endpoints).
const grounding = grab('Agent 2: Documentation Grounding');
const groundedList = (grounding.matched_endpoints || []).map(e => e.endpoint_id);
const validEpIds = new Set(groundedList);

// Fail loudly when grounding found nothing (do NOT fall back to all endpoints).
if (groundedList.length === 0) {
  throw new Error('Gate rejected: Documentation Grounding matched no endpoints; cannot ground the design.');
}

// 2. Design from Agent 3.
const design = grab('Agent 3: Integration Designer') || {};

// 3. Endpoint id: accept only exact grounded matches.
let endpointId = design.endpoint_id || design.endpoint || '';
if (!validEpIds.has(endpointId)) {
  const candidate = groundedList.find(id => endpointId.includes(id));
  endpointId = candidate || '';
}
if (!validEpIds.has(endpointId)) {
  throw new Error(`Gate rejected: endpoint '${endpointId}' not in grounded matches [${groundedList.join(', ')}]`);
}

// 4. Keep only params the knowledge base documents for that endpoint.
const ep = KB_ENDPOINTS.find(e => e.id === endpointId);
const validQuery = new Set(ep ? ep.query_params : []);
const validPath = new Set(ep ? ep.path_params : []);
const filteredParams = (design.params || []).filter(p => {
  if (p.location === 'query') return validQuery.has(p.name);
  if (p.location === 'path') return validPath.has(p.name);
  return true;
});

// 5. ADD the documented params the requirement needs (from Agent 1 + Agent 2).
const parsed = grab('Agent 1: Requirement Interpreter') || {};
const requirementText = [
  parsed.business_requirement || '',
  (parsed.filters || []).map(f => `${f.field}: ${f.value}`).join(' '),
  parsed.entities ? parsed.entities.join(' ') : ''
].join(' ').toLowerCase();

const wantsPreviousDay = /previous day|yesterday|last 24|past day|prior day|last day/.test(requirementText);
const statusFilter = (parsed.filters || []).find(f => /status/.test(String(f.field || '').toLowerCase()));
const customerFilter = (parsed.filters || []).find(f => /customer/i.test(String(f.field || '').toLowerCase()));

const hasQuery = name => filteredParams.some(p => p.name === name);

if (ep && ep.id === 'list_orders') {
  // Status filter from the requirement (e.g. R003 wants completed orders).
  if (!hasQuery('status')) {
    let statusValue = null;
    if (statusFilter && statusFilter.value) statusValue = String(statusFilter.value).toLowerCase();
    if (/completed|finished/.test(requirementText)) statusValue = 'completed';
    if (statusValue) filteredParams.push({
      name: 'status', location: 'query', value: statusValue,
      required: false, source: 'parsed requirement'
    });
  }
  // Date range for "previous day / yesterday".
  if (!hasQuery('start_date') && !hasQuery('end_date') && wantsPreviousDay) {
    const y = isoDaysAgo(1);
    filteredParams.push({ name: 'start_date', location: 'query', value: y, required: false, source: 'previous day' });
    filteredParams.push({ name: 'end_date', location: 'query', value: y, required: false, source: 'previous day' });
  }
  // Customer scope from the requirement (e.g. R006).
  if (!hasQuery('customer_id') && customerFilter && customerFilter.value) {
    filteredParams.push({
      name: 'customer_id', location: 'query', value: String(customerFilter.value),
      required: false, source: 'parsed requirement'
    });
  }
}

// 6. expected_fields: record the fields the plan will return, mapped to documented names.
const docFields = {
  get_single_order: ['order_id','customer_id','created_at','status','payment_status','total','currency','items'],
  list_orders: ['page','limit','total_records','orders','order_id','customer_id','created_at','status','payment_status','total','currency'],
  get_customer: ['customer_id','name','email','customer_since'],
  get_order_delivery: ['order_id','delivery_status','carrier','tracking_reference','estimated_delivery']
};
let expectedFields = design.expected_fields || [];
expectedFields = expectedFields.filter(f => (docFields[endpointId] || []).includes(f));

const final_ = { ...design, endpoint_id: endpointId, params: filteredParams, expected_fields: expectedFields };

return [{ json: final_ }];