import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Wand2,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Sparkles,
  Info,
  Server,
  Cloud,
  Container,
  ExternalLink,
} from 'lucide-react';
import { createPlan, tryInN8n } from '../api.js';
import config from '../config.js';
import { useToast } from '../context/ToastContext.jsx';

export default function NewPlan() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [provider, setProvider] = useState('ollama');
  const [requirement, setRequirement] = useState(
    location.state?.prefilled || ''
  );
  const [loading, setLoading] = useState(null); // null | 'python' | 'n8n'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function generatePlan() {
    if (!requirement.trim()) {
      setError('Please describe your integration requirement first.');
      return;
    }
    setLoading('python');
    setError(null);
    setResult(null);
    try {
      const data = await createPlan(requirement.trim(), provider);
      setResult(data);
      const grounded = Boolean(data.grounded_ok);
      toast.success(
        grounded ? 'Plan grounded' : 'Plan has issues',
        grounded
          ? 'The plan is fully supported by the documentation.'
          : 'Full details below — review before using.'
      );
    } catch (err) {
      setError(err.message);
      toast.error('Could not generate plan', err.message);
    } finally {
      setLoading(null);
    }
  }

  async function generatePlanInDocker() {
    if (!requirement.trim()) {
      setError('Please describe your integration requirement first.');
      return;
    }
    setLoading('n8n');
    setError(null);
    setResult(null);
    try {
      const data = await tryInN8n(requirement.trim());
      setResult(data);
      const grounded = Boolean(data.grounded_ok);
      toast.success(
        grounded ? 'n8n plan grounded' : 'n8n plan has issues',
        grounded
          ? 'Answered by the n8n (Docker) workflow — see it in n8n.'
          : 'Full details below — review before using.'
      );
    } catch (err) {
      setError(err.message);
      toast.error('n8n (Docker) run failed', err.message);
    } finally {
      setLoading(null);
    }
  }

  const openN8nWorkflow = () => {
    const url = `${config.n8nUrl}/workflow/${config.n8nWorkflowId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">New integration plan</h1>
          <p className="page-subtitle">
            Describe a ConnectX API integration in plain English. The copilot identifies the
            right endpoints, parameters and response fields — and verifies everything against
            the documentation.
          </p>
        </div>
      </header>

      <div className="composer-layout">
        <div className="card card-pad composer-card">
          <div className="field-group">
            <label className="field-label" htmlFor="requirement">
              What do you need?
            </label>
            <div className="textarea-wrap">
              <textarea
                id="requirement"
                className="input textarea"
                rows={5}
                placeholder="e.g. Pull all orders completed yesterday, including their date, total and status..."
                value={requirement}
                onChange={(e) => {
                  setRequirement(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">LLM provider</span>
            <div className="provider-choice">
              <button
                type="button"
                className={`provider-option ${provider === 'ollama' ? 'active' : ''}`}
                onClick={() => setProvider('ollama')}
              >
                <Server size={18} aria-hidden="true" />
                <span>
                  <strong>Local</strong>
                  <small>Ollama · Mistral (on-device)</small>
                </span>
              </button>
              <button
                type="button"
                className={`provider-option ${provider === 'mistral' ? 'active' : ''}`}
                onClick={() => setProvider('mistral')}
              >
                <Cloud size={18} aria-hidden="true" />
                <span>
                  <strong>API</strong>
                  <small>Mistral cloud</small>
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="action-row">
            <button
              className="btn btn-primary btn-lg"
              onClick={generatePlan}
              disabled={loading !== null || !requirement.trim()}
            >
              {loading === 'python' ? (
                <>
                  <Loader2 className="spin" size={18} /> Generating plan...
                </>
              ) : (
                <>
                  <Wand2 size={18} /> Generate Plan
                </>
              )}
            </button>
            <button
              className="btn btn-outline btn-lg"
              onClick={generatePlanInDocker}
              disabled={loading !== null || !requirement.trim()}
            >
              {loading === 'n8n' ? (
                <>
                  <Loader2 className="spin" size={18} /> Running n8n in Docker...
                </>
              ) : (
                <>
                  <Container size={18} /> Try in Docker (n8n)
                </>
              )}
            </button>
            {loading === null && (
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={openN8nWorkflow}
                disabled={!config.n8nUrl}
              >
                <ExternalLink size={17} /> Open workflow in n8n
              </button>
            )}
          </div>
        </div>

        <aside className="composer-aside">
          <div className="card card-pad">
            <h3 className="aside-title">
              <Sparkles size={16} className="title-icon" /> How it works
            </h3>
            <ul className="aside-list">
              <li>
                <strong>1. Interprets</strong>
                <p>Extracts scope, filters, frequency and destination from your request.</p>
              </li>
              <li>
                <strong>2. Grounds</strong>
                <p>Matches only against documented ConnectX endpoints, params and fields.</p>
              </li>
              <li>
                <strong>3. Verifies</strong>
                <p>Deterministically checks every element before marking the plan grounded.</p>
              </li>
              <li>
                <strong>4. Reviews</strong>
                <p>You approve or reject before the plan is used.</p>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {loading && (
        <div className="card card-pad mt">
          <div className="pipeline-loading">
            <div className="pipeline-loading-icon">
              <Loader2 className="spin" size={22} />
            </div>
            <div>
              <strong>
                {loading === 'n8n'
                  ? 'Running the n8n workflow in Docker…'
                  : 'Running the copilot pipeline…'}
              </strong>
              <p className="muted-text">
                {loading === 'n8n'
                  ? 'Your requirement is running through the n8n workflow (seventeen.json) in Docker.'
                  : 'Interpreting requirement → grounding against docs → designing call → verifying → synthesizing plan.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="card card-pad mt">
          <div className="error-state">
            <AlertTriangle size={28} />
            <h2>Generation failed</h2>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!loading && result && (
        <PlanResult
          result={result}
          onOpen={() => navigate(`/plans/${result.plan_id}`)}
        />
      )}
    </div>
  );
}

function PlanResult({ result, onOpen }) {
  const grounded = Boolean(result.grounded_ok);
  const pd = result.plan || {};

  const params = Array.isArray(pd.params) ? pd.params : [];
  const fields = pd.expected_fields || [];
  const checklist = pd.developer_review_checklist || [];
  const verification = pd.verification || null;

  return (
    <div className="mt">
      <div className="result-header">
        <div className="result-title">
          <h2 className="page-title">Your integration plan</h2>
          <span className={`result-badge ${grounded ? 'ok' : 'bad'}`}>
            {grounded ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
            <strong>{grounded ? 'Grounded' : 'Needs review'}</strong>
          </span>
          <span className="chip chip-blue">engine: {result.engine || 'python'}</span>
        </div>
        <button className="btn btn-outline" onClick={onOpen}>
          Open full plan <span aria-hidden="true">→</span>
        </button>
      </div>

      {!grounded && (
        <div className="alert alert-warning mt">
          <AlertTriangle size={18} />
          <div>
            <strong>This plan is not fully grounded.</strong>
            <p>
              Items below could not be matched to the documented API. Review them carefully
              before development.
            </p>
          </div>
        </div>
      )}

      <div className="plan-grid">
        <div className="plan-main">
          <div className="card card-pad">
            <div className="mono narrative">
              {result.narrative || <em>No narrative available.</em>}
            </div>
          </div>

          {params.length > 0 && (
            <div className="card card-pad">
              <h2 className="card-title">API parameters</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Location</th>
                      <th>Required</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map((p, i) => (
                      <tr key={i}>
                        <td className="mono">{p.name}</td>
                        <td>
                          <code className="location-tag">{p.location || '—'}</code>
                        </td>
                        <td>{p.required ? 'Yes' : 'No'}</td>
                        <td className="mono">{p.value || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {fields.length > 0 && (
            <div className="card card-pad">
              <h2 className="card-title">Expected fields</h2>
              <div className="chips">
                {fields.map((f, i) => (
                  <span key={i} className="chip">{f}</span>
                ))}
              </div>
            </div>
          )}

          {checklist.length > 0 && (
            <div className="card card-pad">
              <h2 className="card-title">Developer review checklist</h2>
              <ul className="checklist">
                {checklist.map((c, i) => (
                  <li key={i}>
                    <span className="check-box">□</span>
                    {typeof c === 'object' ? c.requirement || c.item : c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="plan-side">
          <div className="card card-pad">
            <h2 className="card-title">Overview</h2>
            <dl className="overview">
              <div>
                <dt>Endpoint</dt>
                <dd className="mono">{pd.recommended_endpoint || '—'}</dd>
              </div>
              <div>
                <dt>Authentication</dt>
                <dd className="mono">{pd.authentication || 'X-API-Key'}</dd>
              </div>
              {pd.pagination && (
                <div>
                  <dt>Pagination</dt>
                  <dd>{pd.pagination}</dd>
                </div>
              )}
            </dl>
          </div>

          {verification && (
            <div className="card card-pad">
              <h2 className="card-title">
                <CheckCircle2 size={17} className="title-icon ok" /> Grounding checks
              </h2>
              <ul className="verification-list">
                {(verification.checks || []).map((c, i) => (
                  <li key={i}>
                    <span
                      className={`status-dot ${
                        c.status === 'violation' ? 'err' : c.status === 'warning' ? 'warn' : 'ok'
                      }`}
                    />
                    <span>
                      <code>{c.item}</code>
                      <span className="muted-text"> · {c.checked_against}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}