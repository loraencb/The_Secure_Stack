import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { sessionId, activeLabDefinition, summary } = useSecureStack();
  const isWorkspaceRoute = /^\/session\/[^/]+\/workspace\/?$/.test(
    location.pathname
  );
  const activeLabName = activeLabDefinition?.name || "Secure Stack Lab";
  const visibleNavItems = user?.is_instructor
    ? [...navItems, { to: "/instructor", label: "Instructor" }]
    : navItems;

  return (
    <div className={`app-shell ${isWorkspaceRoute ? "app-shell--lab" : ""}`}>
      <header className={`topbar ${isWorkspaceRoute ? "topbar--lab" : ""}`}>
        <div className="topbar__inner">
          <NavLink to="/" className="brand-mark">
            <span className="brand-mark__icon">SS</span>
            <span>
              <strong>Secure Stack</strong>
              <small>{isWorkspaceRoute ? activeLabName : "Cyber Lab Platform"}</small>
            </span>
          </NavLink>

          {!isWorkspaceRoute ? (
            <nav className="topbar__nav">
              {visibleNavItems.map((item) => (
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
          ) : null}

          {!isWorkspaceRoute ? (
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
          ) : null}

          {isWorkspaceRoute ? (
            <div className="topbar__workspace-actions">
              <nav className="topbar__nav topbar__nav--lab">
                {visibleNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${getNavClass({ isActive })} nav-link--lab`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <details className="topbar__menu">
                <summary className="button button--ghost topbar__menu-trigger">
                  Menu
                </summary>
                <div className="topbar__menu-content">
                  {sessionId ? (
                    <NavLink
                      to={buildSessionPath(sessionId, "overview")}
                      className="topbar__menu-link"
                    >
                      Session Overview
                    </NavLink>
                  ) : null}
                  <button
                    type="button"
                    className="topbar__menu-link topbar__menu-link--button"
                    onClick={signOut}
                  >
                    Sign Out
                  </button>
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
