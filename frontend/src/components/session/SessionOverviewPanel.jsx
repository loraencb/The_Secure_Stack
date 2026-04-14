import { Link } from "react-router-dom";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { getEvidencePreview } from "../../utils/session";
import { badgeClass } from "./sessionUi";

export default function SessionOverviewPanel() {
  const { activeLabConfig, activeLabDefinition, labInfo, sessionId, summary } =
    useSecureStack();

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
              <p>{summary.activeLabStep?.title || "All guided tasks completed."}</p>
            </div>
            <div className="detail-box detail-box--tertiary">
              <span className="detail-label">Recommended next action</span>
              <p>{summary.recommendedNextAction}</p>
            </div>
          </div>

          <div className="callout callout--info">
            <strong>Suggested flow:</strong> Review the task and environment
            here, open the guide for the walkthrough, then switch into the live
            workspace to validate your evidence.
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
                Review Findings
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
            <span className={badgeClass(labInfo ? "success" : "muted")}>
              {labInfo ? "Launched" : "Waiting to launch"}
            </span>
          </div>

          {labInfo ? (
            <div className="content-stack">
              <div className="detail-grid detail-grid--two">
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Attacker</span>
                  <p>{labInfo.attacker_container}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Target</span>
                  <p>{labInfo.target_container}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Network</span>
                  <p>{labInfo.network_name}</p>
                </div>
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Browser URL</span>
                  <p>{labInfo.browser_url || "No browser URL exposed."}</p>
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
    </div>
  );
}
