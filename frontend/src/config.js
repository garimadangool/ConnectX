const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || '';
const n8nBase = (() => {
  try {
    return webhookUrl ? new URL(webhookUrl).origin : '';
  } catch (e) {
    return '';
  }
})();

const config = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000',
  n8nWebhookUrl: webhookUrl,
  n8nUrl: import.meta.env.VITE_N8N_URL || n8nBase || 'http://localhost:5678',
  n8nWorkflowId: import.meta.env.VITE_N8N_WORKFLOW_ID || 'iCgmmGTtqQ54yt6f',
  n8nProjectId: import.meta.env.VITE_N8N_PROJECT_ID || 'yPht4Y1ItgXj5WeS',
};

export default config;