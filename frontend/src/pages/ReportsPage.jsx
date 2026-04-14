import { Link, Navigate } from "react-router-dom";
import { useSecureStack } from "../context/SecureStackContext";
import { buildSessionPath } from "../utils/routes";

export default function ReportsPage() {
  const { sessionId } = useSecureStack();

  if (sessionId) {
    return <Navigate to={buildSessionPath(sessionId, "reports")} replace />;
  }

  return (
    <div className="page-stack">
      <section className="page-header page-header--single">
        <div>
          <span className="eyebrow">Session Reports</span>
          <h1>Reports live inside the session workspace.</h1>
          <p>
            Open a guided lab session to review findings, save evidence, and
            generate the final report in one place.
          </p>
          <div className="page-header__actions">
            <Link className="button button--primary" to="/labs">
              Browse Labs
            </Link>
            <Link className="button button--ghost" to="/">
              Back Home
            </Link>
          </div>
        </div>
      </section>

      <div className="empty-card empty-card--centered">
        <strong>No active session</strong>
        <p>
          Start a lab to unlock the Reports section inside the session
          workspace.
        </p>
      </div>
    </div>
  );
}
