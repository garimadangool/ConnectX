// ---- Build Final Response (Set node) ----
// Return a HUMAN-READABLE plan (not nested JSON strings).
// Read all structured outputs via top-level .json (grab handles shapes).

// "plan_text" assignment (reads from the Correction-trace nodes directly):
={{
  (() => {
    const plan = $('Agent 5: Plan Synthesizer').first().json || {};
    const gate = $('Gate Validation').first().json || {};
    const verifier = $('Verifier').first().json || {};
    const params = (gate.params || []).map(p => `${p.name}=${p.value || '?'}`).join('&');
    const lines = [];
    lines.push('📋 CONNECTX INTEGRATION PLAN');
    lines.push('');
    lines.push(`Requirement: ${plan.requirement_summary || '—'}`);
    lines.push('');
    lines.push(`Recommended endpoint: ${plan.recommended_endpoint || '—'}`);
    lines.push(`Query params: ${params || '—'}`);
    lines.push(`Authentication: ${plan.authentication || 'X-API-Key'}`);
    lines.push(`Pagination: ${plan.pagination || '—'}`);
    lines.push(`Expected fields: ${(gate.expected_fields || []).join(', ') || '—'}`);
    lines.push('');
    lines.push('Operation steps:');
    (plan.operation_steps || []).forEach(s => lines.push(`  - ${s}`));
    lines.push('');
    lines.push('Error handling:');
    (plan.error_handling || []).forEach(s => lines.push(`  - ${s}`));
    lines.push('');
    lines.push(`Verification: ${verifier.summary || '...'} (grounded: ${verifier.grounded})`);
    return lines.join('\n');
  })()
}})