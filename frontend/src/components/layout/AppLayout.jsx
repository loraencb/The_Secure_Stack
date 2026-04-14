import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/labs", label: "Labs" },
  { to: "/profile", label: "Profile" },
];

function getNavClass({ isActive }) {
  return isActive ? "nav-link nav-link--active" : "nav-link";
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { sessionId, activeLabDefinition, summary } = useSecureStack();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to="/" className="brand-mark">
            <span className="brand-mark__icon">SS</span>
            <span>
              <strong>Secure Stack</strong>
              <small>Cyber Lab Platform</small>
            </span>
          </NavLink>

          <nav className="topbar__nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={getNavClass}>
                {item.label}
              </NavLink>
            ))}
            {sessionId ? (
              <NavLink to={`/session/${sessionId}`} className={getNavClass}>
                Session
              </NavLink>
            ) : null}
          </nav>

          <div className="topbar__status">
            <div className="topbar__status-card topbar__status-card--user">
              <span className="topbar__status-label">Signed In As</span>
              <strong>{user?.display_name || user?.email || "Secure Stack User"}</strong>
            </div>
            <div className="topbar__status-card">
              <span className="topbar__status-label">Current Lab</span>
              <strong>{activeLabDefinition?.name || "Ready to launch"}</strong>
            </div>
            <div className="topbar__status-card">
              <span className="topbar__status-label">Session Progress</span>
              <strong>{summary.progressPercent}% complete</strong>
            </div>
            {sessionId ? (
              <NavLink
                to={buildSessionPath(sessionId, "workspace")}
                className="button button--secondary"
              >
                Resume Session
              </NavLink>
            ) : null}
            <button
              type="button"
              className="button button--ghost"
              onClick={signOut}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
