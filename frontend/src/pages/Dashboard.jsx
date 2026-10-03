import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Wand2,
  History,
  Clock,
  Search,
  ListChecks,
} from 'lucide-react';
import { listPlans } from '../api.js';
import { KpiCard, SectionCard, Spinner, EmptyState, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const SAMPLE_REQUIREMENTS = [
  {
    label: 'Orders completed yesterday',
    text: 'Pull all orders completed yesterday with status=completed, and include their date, total, and order status.',
  },
  {
    label: 'Single order audit',
    text: 'Fetch the full details of order O7842 including delivery status and payment status for a compliance audit.',
  },
  {
    label: 'Pending orders monitor',
    text: 'List all orders still pending today with created date and customer id so support can chase them.',
  },
  {
    label: 'Weekly summary',
    text: 'Summarize all orders created this week with their total and status for a weekly reporting email.',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listPlans(50)
      .then((data) => setPlans(data.plans || []))
      .catch((err) => {
        setError(err.message);
        toast.error('Could not load recent plans', err.message);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = plans ? plans.length : 0;
  const grounded = plans ? plans.filter((p) => p.grounded).length : 0;
  const flagged = plans ? plans.filter((p) => !p.grounded).length : 0;
  const groundedRate = total > 0 ? Math.round((grounded / total) * 100) : 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Integration Copilot</h1>
          <p className="page-subtitle">
            Turn a plain-English requirement into a verified ConnectX API integration plan.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new')}>
          <Wand2 size={16} aria-hidden="true" /> New Plan
        </button>
      </header>

      <div className="kpi-grid">
        <KpiCard
          icon={<FileText size={20} />}
          label="Plans generated"
          value={plans === null ? '—' : total}
          hint="Across this workspace"
        />
        <KpiCard
          icon={<ShieldCheck size={20} />}
          label="Grounding pass rate"
          value={plans === null ? '—' : `${groundedRate}%`}
          hint={`${grounded} fully documented`}
          tone="green"
        />
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="Flagged plans"
          value={plans === null ? '—' : flagged}
          hint={flagged > 0 ? 'Need developer review' : 'Nothing flagged'}
          tone="amber"
        />
      </div>

      <SectionCard
        title="New integration"
        subtitle="Describe what you need in plain English — the copilot does the grounding."
        className="mt"
      >
        <div className="sample-grid">
          {SAMPLE_REQUIREMENTS.map((s, i) => (
            <button
              key={i}
              className="sample-card"
              onClick={() => navigate('/new', { state: { prefilled: s.text } })}
            >
              <span className="sample-icon">
                <Search size={16} aria-hidden="true" />
              </span>
              <span className="sample-title">{s.label}</span>
              <span className="sample-text">{s.text}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Recent plans"
        subtitle="Your latest generated plans and their grounding status."
        icon={<History size={18} />}
        action={
          <Link to="/history" className="link-inline">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
        className="mt"
      >
        {error ? (
          <EmptyState
            icon={<AlertTriangle size={28} />}
            title="Could not reach the backend"
            description={error}
            action={
              <button className="btn btn-outline" onClick={() => window.location.reload()}>
                Retry
              </button>
            }
          />
        ) : plans === null ? (
          <div className="skeleton-list">
            <div className="skeleton-row"><div className="skeleton skeleton-s" /></div>
            <div className="skeleton-row"><div className="skeleton skeleton-s" /></div>
            <div className="skeleton-row"><div className="skeleton skeleton-s" /></div>
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="No plans yet"
            description="Generate your first integration plan and it will appear here."
            action={
              <button className="btn btn-primary" onClick={() => navigate('/new')}>
                <Wand2 size={15} aria-hidden="true" /> Create your first plan
              </button>
            }
          />
        ) : (
          <ul className="plan-list">
            {plans.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link to={`/plans/${p.id}`} className="plan-row">
                  <span className="plan-meta">
                    <span className="plan-summary">{p.summary || 'Untitled plan'}</span>
                    <span className="plan-endpoint mono">{p.endpoint || '—'}</span>
                  </span>
                  <span className="plan-side">
                    <StatusBadge status={p.grounded} />
                    <StatusBadge status={p.review_status || 'pending'} />
                    <span className="plan-time">
                      <Clock size={13} aria-hidden="true" />
                      {formatDate(p.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="How the copilot works" className="mt">
        <ol className="steps-list">
          <li>
            <span className="step-num">1</span>
            <div>
              <strong>Interprets your requirement</strong>
              <p>Extracts entities, filters, scope and frequency from your request.</p>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <strong>Grounds against real docs</strong>
              <p>Matches your request only against documented ConnectX endpoints and fields.</p>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <strong>Verifies before use</strong>
              <p>Every endpoint, parameter and field is checked before the plan is marked grounded.</p>
            </div>
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return iso;
  }
}