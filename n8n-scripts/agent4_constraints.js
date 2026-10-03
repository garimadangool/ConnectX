// ---- Agent 4: Constraint Engine (deterministic) ----
// FIX: read Agent 1 structured output from top-level .json (proven pattern).

const RATE_LIMIT_PER_MIN = 100;
const PAGE_LIMIT = 50;
const FREQ_CALLS = { 'daily': 2, 'every 2 hours': 12, 'every hour': 24, 'weekly': 2, 'on demand': 1, 'not stated': 2 };

function grab(nodeName) {
  const item = $(nodeName).first().json;
  if (item && typeof item === 'object') {
    if (typeof item.output === 'string') {
      try { return JSON.parse(item.output.replace(/```json\n?/g, '').replace(/```/g, '')); }
      catch (e) { return item.output; }
    }
    if (item.output && typeof item.output === 'object') return item.output;
    return item;
  }
  return item;
}

const parsed = grab('Agent 1: Requirement Interpreter');
const design = grab('Gate Validation') || {};

const frequency = (parsed.frequency || 'not stated').toLowerCase();
const scope = parsed.scope || 'single_record';
const endpointId = design.endpoint_id || '';

const paginationNeeded = endpointId === 'list_orders' && scope !== 'single_record';

const calls = FREQ_CALLS[frequency] || 2;
let rateRisk = 'low';
if (calls * 1.5 > RATE_LIMIT_PER_MIN || frequency === 'every 2 hours') rateRisk = 'medium';
if (frequency === 'every hour' && paginationNeeded) rateRisk = 'high';

const relevant = [401];
if (scope === 'single_record' || endpointId === 'get_single_order') relevant.push(404);
if (paginationNeeded || scope === 'multiple_records' || scope === 'summary_or_report') relevant.push(429);
relevant.push(500);

const blockers = [];
if (paginationNeeded && !design.pagination_plan) blockers.push('Pagination plan missing but request may exceed 50 records.');

const risks = [];
if (frequency === 'every hour' && paginationNeeded) risks.push('Hourly full sync risks rate-limit saturation (100 req/min).');

return [{ json: {
  auth_required: true, auth_header: 'X-API-Key',
  pagination_needed: paginationNeeded, pagination_limit: PAGE_LIMIT,
  rate_limit_risk: rateRisk, relevant_errors: [...new Set(relevant)].sort(),
  data_minimization_ok: true, blockers, risks
}}];