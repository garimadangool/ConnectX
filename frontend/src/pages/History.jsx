import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History as HistoryIcon,
  Search,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Wand2,
} from 'lucide-react';
import { listPlans } from '../api.js';
import { Skeleton, EmptyState, StatusBadge } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'grounded', label: 'Grounded' },
  { id: 'flagged', label: 'Needs review' },
];

const REVIEW_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'pending', label: 'Not reviewed' },
];

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
];

export default function History() {
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    listPlans(100)
      .then((data) => setPlans(data.plans || []))
      .catch((err) => {
        setError(err.message);
        toast.error('Could not load plans', err.message);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let list = plans || [];
    if (filter === 'grounded') list = list.filter((p) => p.grounded);
    if (filter === 'flagged') list = list.filter((p) => !p.grounded);
    if (reviewFilter === 'approved') list = list.filter((p) => p.review_status === 'approved');
    if (reviewFilter === 'rejected') list = list.filter((p) => p.review_status === 'rejected');
    if (reviewFilter === 'pending') list = list.filter((p) => !p.review_status);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.summary || '').toLowerCase().includes(needle) ||
          (p.endpoint || '').toLowerCase().includes(needle) ||
          p.id.includes(needle)
      );
    }
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });
    return sorted;
  }, [plans, filter, reviewFilter, q, sort]);

  const groundedCount = plans ? plans.filter((p) => p.grounded).length : 0;
  const flaggedCount = plans ? plans.filter((p) => !p.grounded).length : 0;
  const approvedCount = plans ? plans.filter((p) => p.review_status === 'approved').length : 0;
  const rejectedCount = plans ? plans.filter((p) => p.review_status === 'rejected').length : 0;
  const pendingCount = plans ? plans.filter((p) => !p.review_status).length : 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Plan history</h1>
          <p className="page-subtitle">
            {groundedCount} grounded · {flaggedCount} needing review · {approvedCount} approved ·{' '}
            {rejectedCount} rejected · {pendingCount} not reviewed
          </p>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            className="input search-input"
            type="search"
            placeholder="Search by summary, endpoint or id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search plans"
          />
        </div>
        <div className="toolbar-group">
          <span className="toolbar-label">Status</span>
          <div className="segmented" role="group" aria-label="Filter by grounding status">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`segment ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-label">Review</span>
          <div className="segmented" role="group" aria-label="Filter by review status">
            {REVIEW_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`segment ${reviewFilter === f.id ? 'active' : ''}`}
                onClick={() => setReviewFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-label">
            <ArrowUpDown size={13} aria-hidden="true" /> Sort
          </span>
          <select
            className="input select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort plans"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Could not load plans"
          description={error}
          action={
            <button className="btn btn-outline" onClick={() => window.location.reload()}>
              Retry
            </button>
          }
        />
      ) : plans === null ? (
        <div className="card card-pad">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton skeleton-l" />
              <div className="skeleton skeleton-s" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon={<HistoryIcon size={28} />}
            title={plans.length === 0 ? 'No plans yet' : 'No matches'}
            description={
              plans.length === 0
                ? 'Generate your first plan to see it here.'
                : 'Try adjusting your search or filters.'
            }
            action={
              plans.length === 0 ? (
                <Link to="/new" className="btn btn-primary">
                  <Wand2 size={15} aria-hidden="true" /> Create a plan
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Summary</th>
                <th>Endpoint</th>
                <th className="col-num">Fields</th>
                <th className="col-num">Params</th>
                <th>Status</th>
                <th>Review</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                let planData = p.plan_json;
                if (typeof planData === 'string') {
                  try {
                    planData = JSON.parse(planData);
                  } catch (e) {
                    planData = {};
                  }
                }
                const np = planData && typeof planData === 'object' ? planData : {};
                const fieldCount = Array.isArray(np.expected_fields)
                  ? np.expected_fields.length
                  : 0;
                const paramCount = Array.isArray(np.params) ? np.params.length : 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/plans/${p.id}`} className="table-link">
                        {p.summary || 'Untitled plan'}
                      </Link>
                    </td>
                    <td>
                      <code className="mono endpoint-cell">{p.endpoint || '—'}</code>
                    </td>
                    <td className="col-num">{fieldCount}</td>
                    <td className="col-num">{paramCount}</td>
                    <td>
                      <StatusBadge status={p.grounded} />
                    </td>
                    <td>
                      <StatusBadge status={p.review_status || 'pending'} />
                    </td>
                    <td className="muted-text nowrap">{formatDate(p.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="count-note muted-text">
          Showing {rows.length} of {plans.length} plans
        </p>
      )}
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