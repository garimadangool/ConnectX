// ---- Scope Guard: rejects off-scope chat input (deterministic, no LLM) ----
// Prevents hallucination on greetings / irrelevant messages.
// Passes through anything that looks like an integration request.

const chatInput = ($('When chat message received').first().json.chatInput || '').trim();
const lower = chatInput.toLowerCase();

const keywords = [
  'order', 'customer', 'api', 'pull', 'retrieve', 'fetch', 'get',
  'sync', 'report', 'integration', 'data', 'status', 'payment',
  'delivery', 'ship', 'track', 'reconcil', 'summary', 'list',
  'monitor', 'query', 'support', 'finance', 'operations', 'audit',
  'revenue', 'dispatch', 'profile', 'logistics'
];

const hasKeyword = keywords.some(k => lower.includes(k));
const wordCount = chatInput.split(/\s+/).length;
const hasMinimumLength = wordCount >= 3;

const in_scope = hasKeyword && hasMinimumLength;

const refusal = "I can only help with ConnectX Orders API integration requests. Please describe what order, customer, or delivery data you need.";

return [{
  json: {
    ...$('When chat message received').first().json,
    in_scope,
    refusal
  }
}];