import { Link } from "react-router-dom";
import { useSecureStack } from "../context/SecureStackContext";
import { getEvidencePreview } from "../utils/session";
import { buildSessionPath } from "../utils/routes";

export default function ProfilePage() {
  const { activeLabDefinition, sessionId, summary, report } = useSecureStack();

  return (
    <div className="page-stack">
      <section className="page-header page-header--single">
        <div>
          <span className="eyebrow">Profile And Progress</span>
          <h1>Track the active lab, saved evidence, and session momentum.</h1>
          <p>
            This page gives learners a clean snapshot of the current session,
            guided task progress, and the strongest evidence captured so far.
          </p>
          <div className="page-header__actions">
            {sessionId ? (
              <Link
                className="button button--secondary"
                to={buildSessionPath(sessionId, "workspace")}
              >
                Resume Session
              </Link>
            ) : (
              <Link className="button button--secondary" to="/labs">
                Browse Labs
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="panel-grid panel-grid--triple">
        <article className="surface-card stat-card stat-card--large">
          <span>Active session</span>
          <strong>{sessionId ? `#${sessionId}` : "None"}</strong>
        </article>
        <article className="surface-card stat-card stat-card--large">
          <span>Current lab</span>
          <strong>{activeLabDefinition?.name || "No lab selected"}</strong>
        </article>
        <article className="surface-card stat-card stat-card--large">
          <span>Completion</span>
          <strong>{summary.progressPercent}%</strong>
        </article>
      </section>

      <div className="workspace-grid">
        <div className="workspace-grid__main">
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Session Snapshot</span>
                <h2>Progress Overview</h2>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total tasks</span>
                <strong>{summary.totalSteps}</strong>
              </div>
              <div className="stat-card">
                <span>Completed</span>
                <strong>{summary.completedSteps.length}</strong>
              </div>
              <div className="stat-card">
                <span>Needs evidence</span>
                <strong>{summary.insufficientTasksCount}</strong>
              </div>
              <div className="stat-card">
                <span>Findings</span>
                <strong>{summary.sortedFindings.length}</strong>
              </div>
            </div>

            <div className="detail-box">
              <span className="detail-label">Recommended next action</span>
              <p>{summary.recommendedNextAction}</p>
            </div>

            <div className="detail-box">
              <span className="detail-label">Current task</span>
              <p>{summary.activeLabStep?.title || "All guided tasks completed."}</p>
            </div>
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Saved Evidence</span>
                <h2>Completed Task Highlights</h2>
              </div>
            </div>

            {summary.compactEvidenceSummary.length ? (
              <div className="stack-list">
                {summary.compactEvidenceSummary.map(({ step, progress }) => (
                  <div key={step.task_id} className="stack-list__item">
                    <strong>{step.title}</strong>
                    <p>{getEvidencePreview(progress)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <strong>No saved evidence yet</strong>
                <p>
                  Completed tasks with saved evidence will appear here as the
                  lab progresses.
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="workspace-grid__side">
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Report Status</span>
                <h2>Latest Analysis</h2>
              </div>
            </div>

            {report ? (
              <div className="content-stack">
                <div className="detail-box">
                  <span className="detail-label">Risk level</span>
                  <p>{report.analysis?.risk_level || "Unknown"}</p>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Summary</span>
                  <p>{report.analysis?.summary || "No summary available."}</p>
                </div>
              </div>
            ) : (
              <div className="empty-card">
                <strong>No report yet</strong>
                <p>
                  Generate a report from the session workspace to surface the
                  latest analysis here.
                </p>
              </div>
            )}
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">History</span>
                <h2>Session Archive</h2>
              </div>
            </div>

            <div className="empty-card">
              <strong>Archive not available yet</strong>
              <p>
                This view currently focuses on the active session. Completed
                session history will appear here once archived sessions are
                available.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
