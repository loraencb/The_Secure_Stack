import { Link } from "react-router-dom";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { getEvidencePreview } from "../../utils/session";
import { badgeClass } from "./sessionUi";

export default function SessionOverviewPanel() {
  const {
    activeLabConfig,
    activeLabDefinition,
    labInfo,
    sessionRecord,
    sessionId,
    summary,
    workflow,
  } = useSecureStack();
  const runtimeReady = workflow.environmentLaunched;
  const runtimeInfo = labInfo;

  return (
    <div className="page-stack">
      <section className="panel-grid panel-grid--double">
        <article className="surface-card overview-panel overview-panel--primary">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Overview</span>
              <h2>Session Pulse</h2>
            </div>
            <span className={badgeClass("info")}>
              {summary.completedSteps.length}/{summary.totalSteps} tasks complete
            </span>
          </div>

          <p className="section-lead">
            Start the lab here: understand the current task, orient yourself to
            the session, then move into the guide and workspace with a clear
            next step.
          </p>

          <div className="stats-grid">
            <div className="stat-card stat-card--tertiary">
              <span>Total tasks</span>
              <strong>{summary.totalSteps}</strong>
            </div>
            <div className="stat-card stat-card--tertiary">
              <span>Completed</span>
              <strong>{summary.completedSteps.length}</strong>
            </div>
            <div className="stat-card stat-card--tertiary">
              <span>Needs evidence</span>
              <strong>{summary.insufficientTasksCount}</strong>
            </div>
            <div className="stat-card stat-card--tertiary">
              <span>Findings</span>
              <strong>{summary.sortedFindings.length}</strong>
            </div>
          </div>

          <div className="content-stack">
            <div className="detail-box detail-box--tertiary">
              <span className="detail-label">Current task</span>
              <p>{workflow.currentTaskLabel}</p>
            </div>
            <div className="detail-box detail-box--tertiary">
              <span className="detail-label">Recommended next action</span>
              <p>
                <strong>{workflow.nextRecommendation.label}:</strong>{" "}
                {workflow.nextRecommendation.description}
              </p>
            </div>
            <div className="detail-box detail-box--tertiary">
              <span className="detail-label">Workflow state</span>
              <p>{workflow.status.detail}</p>
            </div>
          </div>

          <div className="callout callout--info">
            <strong>Suggested flow:</strong> Review the task and environment
            here, then follow the current recommendation:{" "}
            {workflow.nextRecommendation.description}
          </div>

          <div className="session-cta-row">
            <Link
              className="button button--primary"
              to={buildSessionPath(sessionId, "guide")}
            >
              Open Guide
            </Link>
            <Link
              className="button button--secondary"
              to={buildSessionPath(sessionId, "workspace")}
            >
              Open Workspace
            </Link>
            {summary.sortedFindings.length ? (
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, "reports")}
              >
                Open Reports
              </Link>
            ) : null}
          </div>
        </article>

        <article className="surface-card overview-panel overview-panel--tertiary">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Environment</span>
              <h2>Runtime Status</h2>
            </div>
            <span className={badgeClass(runtimeReady ? "success" : "muted")}>
              {runtimeReady ? "Launched" : "Waiting to launch"}
            </span>
          </div>

          {runtimeInfo ? (
            <div className="content-stack">
              <div className="detail-grid detail-grid--two">
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Attacker</span>
                  <p>{runtimeInfo.attacker_container || "Unavailable"}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Target</span>
                  <p>{runtimeInfo.target_container || "Unavailable"}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Network</span>
                  <p>{runtimeInfo.network_name || "Unavailable"}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Browser URL</span>
                  <p>{runtimeInfo.browser_url || "No browser URL exposed."}</p>
                </div>
              </div>
            </div>
          ) : runtimeReady ? (
            <div className="empty-card">
              <div className="content-stack">
                <strong>Environment launched</strong>
                <p>
                  The session has a persisted launch record from{" "}
                  {sessionRecord?.environment_launched_at
                    ? new Date(
                        sessionRecord.environment_launched_at
                      ).toLocaleString()
                    : "this run"}
                  , but the runtime details are not available in the current
                  view yet.
                </p>
                <div className="inline-actions">
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "workspace")}
                  >
                    Open Workspace
                  </Link>
                  <Link
                    className="button button--ghost"
                    to={buildSessionPath(sessionId, "reports")}
                  >
                    Open Reports
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-card">
              <div className="content-stack">
                <strong>Environment not launched yet</strong>
                <p>
                  Open the workspace when you are ready to launch the training
                  environment and begin validating the current step.
                </p>
                <div className="inline-actions">
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "workspace")}
                  >
                    Open Workspace
                  </Link>
                  <Link
                    className="button button--ghost"
                    to={buildSessionPath(sessionId, "guide")}
                  >
                    Review Guide
                  </Link>
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Lab Briefing</span>
            <h2>{activeLabDefinition?.name || activeLabConfig.name}</h2>
          </div>
          <span className={badgeClass("warning")}>
            {activeLabDefinition?.difficulty || activeLabConfig.difficulty}
          </span>
        </div>

        {activeLabDefinition ? (
          <div className="session-overview-grid">
            <div className="detail-box">
              <span className="detail-label">Description</span>
              <p>
                {activeLabDefinition.description ||
                  "No lab description available."}
              </p>
            </div>

            {activeLabDefinition.learning_objectives?.length ? (
              <div className="detail-box">
                <span className="detail-label">Learning Objectives</span>
                <ul className="detail-list">
                  {activeLabDefinition.learning_objectives.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeLabDefinition.prerequisites?.length ? (
              <div className="detail-box">
                <span className="detail-label">Prerequisites</span>
                <ul className="detail-list">
                  {activeLabDefinition.prerequisites.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeLabDefinition.success_criteria?.length ? (
              <div className="detail-box">
                <span className="detail-label">Success Criteria</span>
                <ul className="detail-list">
                  {activeLabDefinition.success_criteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-card">
            <div className="content-stack">
              <strong>Loading lab briefing</strong>
              <p>
                The structured module details are still loading for this
                session.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Evidence</span>
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
            <div className="content-stack">
              <strong>No saved evidence yet</strong>
              <p>
                Evidence snippets will appear here after you complete guide
                steps and validate them in the workspace.
              </p>
              <div className="inline-actions">
                <Link
                  className="button button--primary"
                  to={buildSessionPath(sessionId, "guide")}
                >
                  Open Guide
                </Link>
                <Link
                  className="button button--ghost"
                  to={buildSessionPath(sessionId, "workspace")}
                >
                  Open Workspace
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Replay</span>
            <h2>Investigation Timeline</h2>
          </div>
          <span
            className={badgeClass(
              workflow.timeline.latestEntry?.tone || "muted"
            )}
          >
            {workflow.timeline.entryCount
              ? `${workflow.timeline.entryCount} events`
              : "No replay yet"}
          </span>
        </div>

        <p className="section-lead">
          This timeline turns the current session state into a readable
          investigation trail, from launch and task validation through evidence,
          findings, and reporting.
        </p>

        {workflow.timeline.entries.length ? (
          <div className="timeline-list">
            {workflow.timeline.entries.map((entry) => (
              <article key={entry.key} className="timeline-entry">
                <div
                  className={`timeline-entry__marker timeline-entry__marker--${entry.tone}`}
                  aria-hidden="true"
                />
                <div className="timeline-entry__body">
                  <div className="section-heading">
                    <div>
                      <h3>{entry.label}</h3>
                      <p>{entry.detail}</p>
                    </div>
                    <span className={badgeClass(entry.tone)}>
                      {entry.category}
                    </span>
                  </div>
                  <div className="timeline-entry__meta">
                    <span>
                      {entry.timestampLabel ||
                        "Ordered from the current session state"}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <div className="content-stack">
              <strong>No timeline events yet</strong>
              <p>
                Start the lab, move through the guide and workspace, and save
                evidence to build a readable replay of the investigation.
              </p>
              <div className="inline-actions">
                <Link
                  className="button button--primary"
                  to={buildSessionPath(sessionId, "workspace")}
                >
                  Open Workspace
                </Link>
                <Link
                  className="button button--ghost"
                  to={buildSessionPath(sessionId, "guide")}
                >
                  Review Guide
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
