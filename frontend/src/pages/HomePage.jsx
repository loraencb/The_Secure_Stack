import { Link, useNavigate } from "react-router-dom";
import StatusBanner from "../components/StatusBanner";
import { useSecureStack } from "../context/SecureStackContext";
import { buildSessionPath } from "../utils/routes";

export default function HomePage() {
  const navigate = useNavigate();
  const {
    activeLabConfig,
    activeLabDefinition,
    sessionId,
    message,
    clearMessage,
    startingSession,
    summary,
    startNewSession,
  } = useSecureStack();

  async function handleStartSession() {
    try {
      const result = await startNewSession(activeLabConfig.labId);
      if (result?.id) {
        navigate(buildSessionPath(result.id, "workspace"));
      }
    } catch {
      // Message state is handled in shared context.
    }
  }

  return (
    <div className="page-stack">
      <section className="hero hero--home">
        <div className="hero__content">
          <div className="hero__eyebrow">Cyber Lab Platform</div>
          <h1>Run guided security labs in one focused workspace.</h1>
          <p>
            Secure Stack brings together live terminal work, AI review, saved
            evidence, and session reporting so each lab feels like a real
            investigation.
          </p>

          <div className="inline-actions">
            <Link className="button button--primary" to="/labs">
              Browse Labs
            </Link>
            <button
              type="button"
              className="button button--secondary"
              onClick={handleStartSession}
              disabled={startingSession}
            >
              {startingSession ? "Starting..." : "Start Session"}
            </button>
            {sessionId ? (
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, "workspace")}
              >
                Resume Session
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero__panel">
          <div className="hero__metric">
            <span>Featured lab</span>
            <strong>{activeLabDefinition?.name || activeLabConfig.name}</strong>
          </div>
          <div className="hero__metric">
            <span>Guided tasks</span>
            <strong>{activeLabDefinition?.tasks?.length || 0}</strong>
          </div>
          <div className="hero__metric">
            <span>Session progress</span>
            <strong>{summary.progressPercent}% complete</strong>
          </div>
        </div>
      </section>

      <StatusBanner message={message} onDismiss={clearMessage} />

      <section className="panel-grid panel-grid--triple">
        <article className="surface-card feature-card">
          <span className="eyebrow">Interactive</span>
          <h2>Live shell workspace</h2>
          <p>
            Launch into the environment, validate each task, and keep commands,
            output, and context in one place.
          </p>
        </article>

        <article className="surface-card feature-card">
          <span className="eyebrow">Guided</span>
          <h2>Mini lab guide</h2>
          <p>
            Overview, guide, workspace, and reports stay connected so learners
            always know what to do next.
          </p>
        </article>

        <article className="surface-card feature-card">
          <span className="eyebrow">Evidence</span>
          <h2>Findings and reports</h2>
          <p>
            Capture findings, review AI feedback, and turn the strongest
            evidence into a polished session report.
          </p>
        </article>
      </section>

      <section className="surface-card page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">At A Glance</span>
            <h2>Current Lab Snapshot</h2>
          </div>
          <Link className="button button--ghost" to="/profile">
            View Progress
          </Link>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Active session</span>
            <strong>{sessionId ? `#${sessionId}` : "None"}</strong>
          </div>
          <div className="stat-card">
            <span>Completed tasks</span>
            <strong>{summary.completedSteps.length}</strong>
          </div>
          <div className="stat-card">
            <span>Findings captured</span>
            <strong>{summary.sortedFindings.length}</strong>
          </div>
          <div className="stat-card">
            <span>Next recommended step</span>
            <strong>{summary.activeLabStep?.title || "Start the lab"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
