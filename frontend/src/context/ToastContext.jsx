import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type, message, description) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message, description }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  const toast = {
    success: (m, d) => notify('success', m, d),
    error: (m, d) => notify('error', m, d),
    info: (m, d) => notify('info', m, d),
    warning: (m, d) => notify('warning', m, d),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-viewport" role="region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <span className="toast-icon">{toastIcon(t.type)}</span>
            <div className="toast-body">
              <p className="toast-message">{t.message}</p>
              {t.description && (
                <p className="toast-description">{t.description}</p>
              )}
            </div>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toastIcon(type) {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={18} />;
    case 'error':
      return <XCircle size={18} />;
    case 'warning':
      return <AlertTriangle size={18} />;
    default:
      return <Info size={18} />;
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}