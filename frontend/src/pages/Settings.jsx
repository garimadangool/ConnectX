import { useState } from 'react';
import {
  Server,
  Cloud,
  KeyRound,
  Settings,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import config from '../config.js';
import { useToast } from '../context/ToastContext.jsx';

export default function SettingsPage() {
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);

  const keyStatus = () => {
    const k = (import.meta.env.VITE_MISTRAL_API_KEY || '').trim();
    if (!k) return 'Not configured';
    return 'Configured via environment';
  };

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied', `${label} copied to clipboard.`);
    } catch (e) {
      toast.error('Copy failed', 'Clipboard not available in this browser.');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Runtime configuration for the copilot backend.</p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="card card-pad">
          <h2 className="card-title">
            <Server size={17} className="title-icon" /> Local model
          </h2>
          <p className="muted-text">On-device inference via Ollama.</p>
          <dl className="settings-list">
            <div>
              <dt>Status</dt>
              <dd>
                <span className="status-badge ok">Available locally</span>
              </dd>
            </div>
            <div>
              <dt>Base URL</dt>
              <dd className="mono">
                {import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'}
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd className="mono">{import.meta.env.VITE_OLLAMA_MODEL || 'mistral'}</dd>
            </div>
          </dl>
          <p className="hint-text">
            Runs entirely on your machine — no data leaves the device.
          </p>
        </div>

        <div className="card card-pad">
          <h2 className="card-title">
            <Cloud size={17} className="title-icon" /> Mistral API
          </h2>
          <p className="muted-text">Cloud inference for the API provider toggle.</p>
          <dl className="settings-list">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`status-badge ${keyStatus() === 'Not configured' ? 'warn' : 'ok'}`}>
                  {keyStatus()}
                </span>
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd className="mono">
                {import.meta.env.VITE_MISTRAL_MODEL || 'mistral-small-latest'}
              </dd>
            </div>
            <div>
              <dt>Base URL</dt>
              <dd className="mono">https://api.mistral.ai/v1</dd>
            </div>
          </dl>
          <div className="action-row">
            <button className="btn btn-outline" onClick={() => setRevealed(!revealed)}>
              <KeyRound size={15} aria-hidden="true" /> {revealed ? 'Hide' : 'Show'} API key
            </button>
          </div>
          {revealed && (
            <div className="key-block">
              <code className="mono">
                {(() => {
                  const k = (import.meta.env.VITE_MISTRAL_API_KEY || '').trim();
                  return k
                    ? `${k.slice(0, 8)}••••••••${k.slice(-4)}`
                    : 'VITE_MISTRAL_API_KEY not set in frontend/.env';
                })()}
              </code>
              <button className="copy-btn" onClick={() => copy('', 'API key status')}>
                <Copy size={13} aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="hint-text">
            Set <code>MISTRAL_API_KEY</code> in the backend <code>.env</code>. The key is never
            exposed to the browser.
          </p>
        </div>

        <div className="card card-pad">
          <h2 className="card-title">
            <Settings size={17} className="title-icon" /> Backend
          </h2>
          <dl className="settings-list">
            <div>
              <dt>API base URL</dt>
              <dd className="mono">{config.backendUrl}</dd>
            </div>
            <div>
              <dt>n8n webhook</dt>
              <dd className="mono">
                {config.n8nWebhookUrl || 'Not configured (local backend path in use)'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}