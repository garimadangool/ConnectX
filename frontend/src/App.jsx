import { Routes, Route, NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wand2, History as HistoryIcon, Settings, Zap } from 'lucide-react';
import './App.css';
import Dashboard from './pages/Dashboard.jsx';
import NewPlan from './pages/NewPlan.jsx';
import History from './pages/History.jsx';
import PlanDetail from './pages/PlanDetail.jsx';
import SettingsPage from './pages/Settings.jsx';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/new', label: 'New Plan', icon: Wand2 },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <Zap size={18} strokeWidth={2.5} />
      </span>
      <span className="logo-text">
        <strong>ConnectX</strong>
        <small>Integration Copilot</small>
      </span>
    </div>
  );
}

function Shell() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <Logo />
          <nav className="nav" aria-label="Primary">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="status-pill">
              <span className="status-dot" aria-hidden="true" />
              Backend connected
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="new" element={<NewPlan />} />
        <Route path="history" element={<History />} />
        <Route path="plans/:planId" element={<PlanDetail />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}