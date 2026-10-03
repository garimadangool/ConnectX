import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}

export function StatusBadge({ status, dot = true }) {
  let className = 'badge';
  let label = String(status ?? 'unknown');
  if (status === true || status === 'true' || status === 'grounded') {
    className += ' badge-green';
    label = 'Grounded';
  } else if (status === false || status === 'false' || status === 'not_grounded') {
    className += ' badge-red';
    label = 'Not grounded';
  } else if (status === 'approved') {
    className += ' badge-green';
  } else if (status === 'rejected') {
    className += ' badge-red';
  } else if (status === 'pending') {
    className += ' badge-amber';
  } else if (status === 'low' || status === 'medium' || status === 'high') {
    className += ` badge-${status}`;
  } else {
    className += ' badge-neutral';
  }
  return (
    <span className={className}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {label}
    </span>
  );
}

export function Chip({ children, tone = 'default' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-description">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SectionCard({ title, subtitle, icon, action, children, className = '' }) {
  return (
    <section className={`section-card ${className}`}>
      {(title || action) && (
        <div className="section-card-header">
          <div className="section-card-heading">
            {icon && <span className="section-card-icon">{icon}</span>}
            <div>
              {title && <h2 className="section-card-title">{title}</h2>}
              {subtitle && <p className="section-card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="section-card-action">{action}</div>}
        </div>
      )}
      <div className="section-card-body">{children}</div>
    </section>
  );
}

export function KpiCard({ icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon kpi-icon-${tone}`}>{icon}</div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

export function Copyable({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copyable">
      <code>{text}</code>
      <button
        className="copy-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch (e) {
            /* clipboard unavailable */
          }
        }}
        aria-label="Copy to clipboard"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}