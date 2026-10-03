import config from './config.js';

async function request(path, options = {}) {
  const res = await fetch(`${config.backendUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no JSON body
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      `Request failed with status ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function createPlan(requirementText, provider, engine) {
  return request('/plan', {
    method: 'POST',
    body: JSON.stringify({ requirement_text: requirementText, provider, engine }),
  });
}

export function tryInN8n(requirementText) {
  return createPlan(requirementText, 'ollama', 'n8n');
}

export function listPlans(limit = 50) {
  return request(`/plans?limit=${limit}`);
}

export function getPlan(planId) {
  return request(`/plans/${planId}`);
}

export function reviewPlan(planId, decision, comment) {
  return request(`/plans/${planId}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  });
}