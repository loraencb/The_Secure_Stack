import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionHistory } from "../api/Client";
import { useSecureStack } from "../context/SecureStackContext";
import { buildSessionPath } from "../utils/routes";
import { getEvidencePreview } from "../utils/session";

function formatHistoryDate(value) {
  if (!value) {
    return "Unavailable";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function getHistoryTone(status) {
  switch (status) {
    case "Report generated":
      return "success";
    case "Evidence captured":
      return "info";
    case "Environment launched":
      return "sky";
    case "Completed":
      return "muted";
    default:
      return "warning";
  }
}

function getHistoryOpenLabel(entry, activeSessionId) {
  return entry.id === activeSessionId ? "Resume Session" : "Open Session";
}

function getHistoryTargetSection(entry) {
  if (entry.report_generated_at) {
    return "reports";
  }

  if (entry.environment_launched_at) {
    return "overview";
  }

  return "overview";
}

export default function ProfilePage() {
  const {
    activeLabDefinition,
    sessionId,
    sessionRecord,
    summary,
    report,
    workflow,
  } = useSecureStack();
  const [sessionHistory, setSessionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const history = await getSessionHistory();
        if (!cancelled) {
          setSessionHistory(Array.isArray(history) ? history : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Session history load error:", error);
          setHistoryError(
            error.message || "Failed to load previous investigations."
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    workflow.environmentLaunched,
    workflow.reportGenerated,
    summary.sortedFindings.length,
  ]);

  const currentHistoryEntry = useMemo(
    () => sessionHistory.find((entry) => entry.id === sessionId) || null,
    [sessionHistory, sessionId]
  );
  const priorSessions = useMemo(
    () => sessionHistory.filter((entry) => entry.id !== sessionId),
    [sessionHistory, sessionId]
  );

  return (
    <div className="page-stack">
      <section className="page-header page-header--single">
        <div>
          <span className="eyebrow">Profile And Progress</span>
          <h1>Track active work and reopen durable past investigations.</h1>
          <p>
            This page keeps the current session visible while also surfacing
            earlier labs the platform remembers from the backend.
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
          <span>Prior investigations</span>
          <strong>{priorSessions.length}</strong>
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
              <p>
                <strong>{workflow.nextRecommendation.label}:</strong>{" "}
                {workflow.nextRecommendation.description}
              </p>
            </div>

            <div className="detail-box">
              <span className="detail-label">Current task</span>
              <p>{summary.activeLabStep?.title || "All guided tasks completed."}</p>
            </div>

            <div className="detail-box">
              <span className="detail-label">Backend session state</span>
              <p>
                {currentHistoryEntry?.history_status ||
                  (sessionRecord?.report_generated_at
                    ? "Report generated"
                    : sessionRecord?.environment_launched_at
                    ? "Environment launched"
                    : sessionId
                    ? "In progress"
                    : "No active session")}
              </p>
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
            ) : workflow.reportGenerated ? (
              <div className="empty-card">
                <strong>Report generated</strong>
                <p>
                  A report has already been generated for this session. Open
                  the session reports view to refresh or review the latest
                  analysis.
                </p>
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
                <h2>Investigation Archive</h2>
              </div>
            </div>

            {historyLoading ? (
              <div className="empty-card">
                <strong>Loading session history</strong>
                <p>The backend is preparing durable investigation summaries.</p>
              </div>
            ) : historyError ? (
              <div className="empty-card">
                <strong>History unavailable</strong>
                <p>{historyError}</p>
              </div>
            ) : priorSessions.length ? (
              <div className="stack-list history-list">
                {priorSessions.map((entry) => (
                  <article
                    key={entry.id}
                    className="stack-list__item history-list__item"
                  >
                    <div className="section-heading">
                      <div>
                        <h3>{entry.lab_name || entry.lab_id || "Legacy session"}</h3>
                        <p>Session #{entry.id}</p>
                      </div>
                      <span className={`badge badge--${getHistoryTone(entry.history_status)}`}>
                        {entry.history_status}
                      </span>
                    </div>

                    <div className="content-stack">
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Started</span>
                        <p>{formatHistoryDate(entry.start_time)}</p>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Findings</span>
                        <p>{entry.findings_count} saved</p>
                      </div>
                      <div className="detail-box detail-box--tertiary">
                        <span className="detail-label">Runtime</span>
                        <p>
                          {entry.environment_launched_at
                            ? `${entry.attacker_container || "Attacker"} -> ${
                                entry.target_container || "Target"
                              }`
                            : "Environment was not launched or older metadata is unavailable."}
                        </p>
                      </div>
                      <div className="inline-actions">
                        <Link
                          className="button button--secondary"
                          to={buildSessionPath(
                            entry.id,
                            getHistoryTargetSection(entry)
                          )}
                        >
                          {getHistoryOpenLabel(entry, sessionId)}
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <strong>No prior investigations yet</strong>
                <p>
                  Previous sessions will appear here once the platform has more
                  than the current live investigation to remember.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
