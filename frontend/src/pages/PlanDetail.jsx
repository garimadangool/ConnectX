import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Wand2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  Layers,
  ArrowLeft,
  Cpu,
  GitBranch,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { createPlan, getPlan, reviewPlan } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import config from '../config.js';

export default function PlanDetail() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState({ decision: null, comment: '' });
  const [reviewing, setReviewing] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    getPlan(planId)
      .then((data) => {
        let planData = data.plan_json;
        if (typeof planData === 'string') {
          try {
            planData = JSON.parse(planData);
          } catch (e) {
            planData = {};
          }
        }
        setPlan({ ...data, plan_data: planData });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function submitReview(decision) {
    const existing = plan.reviews && plan.reviews.find((r) => r.decision === decision);
    if (existing) {
      toast.info('Already reviewed', `This plan was already ${decision}.`);
      return;
    }
    setReviewing(true);
    try {
      await reviewPlan(planId, decision, review.comment);
      toast.success(
        `Plan ${decision}`,
        decision === 'approved' ? 'The plan was approved.' : 'The plan was rejected.'
      );
      load();
    } catch (err) {
      toast.error('Review failed', err.message);
    } finally {
      setReviewing(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen">
          <Loader2 className="spin" size={28} />
          <p>Loading plan...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="page">
        <div className="error-state">
          <AlertTriangle size={28} />
          <h2>Could not load plan</h2>
          <p>{error || 'Plan not found.'}</p>
          <button className="btn btn-outline" onClick={() => navigate('/history')}>
            Back to history
          </button>
        </div>
      </div>
    );
  }

  const pd = plan.plan_data || {};
  const narrative = pd.narrative || (plan.narrative);
  const grounded = Boolean(plan.grounded ?? pd.grounded_ok ?? pd.grounded);
  const params = Array.isArray(pd.params) ? pd.params : [];
  const allowedFields = pd.expected_fields || pd.expectedFields || [];
  const unsupported = pd.unsupported_items || pd.unsupported_fields || pd.unsupported || [];
  const ops = pd.operation_steps || pd.operation_steps_display || [];
  const errors = Array.isArray(pd.error_handling) ? pd.error_handling : [];
  const limitations = Array.isArray(pd.limitations) ? pd.limitations : [];
  const checklist = pd.developer_review_checklist || [];
  const traces = (plan.traces || []).map((t) => {
    let det = t.detail;
    if (typeof det === 'string') {
      try {
        det = JSON.parse(det);
      } catch (e) {}
    }
    return { ...t, detail: det };
  });

  return (
    <div className="page">
      <button className="link-inline back-link" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </button>

      <header className="page-header">
        <div>
          <div className="plan-id-line">
            <h1 className="page-title">{pd.requirement_summary || 'Integration plan'}</h1>
            <div className="status-line">
              <span className={`status-badge ${grounded ? 'ok' : 'bad'}`}>
                {grounded ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                {grounded ? 'Grounded' : 'Not grounded'}
              </span>
              <span className="muted-text mono">{planId.slice(0, 12)}</span>
            </div>
          </div>
          <p className="page-subtitle">Generated {formatDateTime(plan.created_at)}</p>
        </div>
        <div className="action-row">
          {traces.length > 0 && (
            <>
              {config.n8nUrl && (
                <a
                  className="btn btn-outline"
                  href={`${config.n8nUrl.replace(/\/$/, '')}/workflow/${config.n8nWorkflowId}?projectId=${config.n8nProjectId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch size={16} aria-hidden="true" /> View in n8n
                </a>
              )}
              <button
                className="btn btn-outline"
                onClick={() =>
                  document
                    .querySelector('.pipeline-section')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                <GitBranch size={16} aria-hidden="true" /> View pipeline
              </button>
            </>
          )}
        </div>
      </header>

      {!grounded && (
        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>This plan is not fully grounded.</strong>
            <p>
              The following items could not be matched against the documented ConnectX API —
              review them before using this plan.
            </p>
          </div>
        </div>
      )}

      <div className="plan-grid">
        <div className="plan-main">
          {narrative && (
            <section className="card card-pad">
              <h2 className="card-title">Integration plan</h2>
              <div className="narrative">{narrative}</div>
            </section>
          )}

          {params.length > 0 && (
            <section className="card card-pad">
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
            </section>
          )}

          {allowedFields.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">Expected fields</h2>
              <div className="chips">
                {allowedFields.map((f, i) => (
                  <span key={i} className="chip">
                    {f}
                  </span>
                ))}
              </div>
            </section>
          )}

          {unsupported && unsupported.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">
                <AlertTriangle size={17} className="title-icon warn" /> Unsupported items
              </h2>
              <ul className="item-list">
                {unsupported.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </section>
          )}

          {ops.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">Operation steps</h2>
              <ol className="step-list">
                {ops.map((s, i) => (
                  <li key={i}>{typeof s === 'string' ? s : JSON.stringify(s)}</li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="plan-side">
          <section className="card card-pad">
            <h2 className="card-title">Overview</h2>
            <dl className="overview">
              <div>
                <dt>Endpoint</dt>
                <dd className="mono">{pd.recommended_endpoint || '—'}</dd>
              </div>
              <div>
                <dt>Grounding</dt>
                <dd>
                  <span className={`status-badge ${grounded ? 'ok' : 'bad'}`}>
                    {grounded ? 'Grounded' : 'Flagged'}
                  </span>
                </dd>
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
          </section>

          {checklist.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">
                <Layers size={17} className="title-icon" /> Developer review
              </h2>
              <ul className="checklist">
                {checklist.map((item, i) => (
                  <li key={i}>
                    <span className="check-box">□</span>
                    {typeof item === 'object' ? item.requirement || item.item : item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="card-title">Decision</h2>
            {plan.reviews && plan.reviews.length > 0 ? (
              <div className="review-stamp">
                {plan.reviews.map((r, i) => (
                  <div key={i} className={`review-badge ${r.decision === 'approved' ? 'ok' : 'bad'}`}>
                    {r.decision === 'approved' ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />}
                    <span className="capitalize">{r.decision}</span>
                    {r.comment && <span className="review-comment">{r.comment}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Optional comment for your review..."
                  value={review.comment}
                  onChange={(e) => setReview({ ...review, comment: e.target.value })}
                />
                <div className="action-row">
                  <button
                    className="btn btn-success"
                    disabled={reviewing}
                    onClick={() => submitReview('approved')}
                  >
                    {reviewing ? <Loader2 className="spin" size={16} /> : <ThumbsUp size={16} />}
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={reviewing}
                    onClick={() => submitReview('rejected')}
                  >
                    {reviewing ? <Loader2 className="spin" size={16} /> : <ThumbsDown size={16} />}
                    Reject
                  </button>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>

      {traces.length > 0 && (
        <section className="card card-pad mt pipeline-section" id="pipeline-section">
          <h2 className="card-title">
            <Cpu size={17} className="title-icon" /> Agent pipeline trace
          </h2>
          <ol className="pipeline-list">
            {traces.map((t, i) => (
              <li key={i} className={`pipeline-step ${t.status === 'error' ? 'error' : ''}`}>
                <div className="pipeline-dot" />
                <div className="pipeline-content">
                  <div className="pipeline-header">
                    <span className="pipeline-name">{t.agent || t.node}</span>
                    <span className="pipeline-meta">
                      <span className="muted-text">{t.node}</span>
                      <span className="badge badge-soft">{(t.elapsed || 0).toFixed(1)}s</span>
                      <span className={`status-badge ${t.status === 'ok' ? 'ok' : t.status === 'error' ? 'bad' : 'warn'}`}>
                        {t.status || 'ok'}
                      </span>
                    </span>
                  </div>
                  {t.detail && <pre className="pipeline-detail">{JSON.stringify(t.detail, null, 2)}</pre>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}