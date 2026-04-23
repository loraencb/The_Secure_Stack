import { Link } from "react-router-dom";
import { SESSION_SECTIONS } from "../../config/sessionSections";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { getEvidencePreview } from "../../utils/session";
import { getSectionNavigationLabel } from "../../utils/workflow";

function getOrientationGoals(activeLabDefinition, workflow) {
  const authoredGoals = activeLabDefinition?.learning_objectives?.length
    ? activeLabDefinition.learning_objectives
    : activeLabDefinition?.success_criteria?.length
    ? activeLabDefinition.success_criteria
    : [];

  if (authoredGoals.length) {
    return authoredGoals.slice(0, 4);
  }

  return [
    workflow.currentTaskObjective || "Understand the active lab objective.",
    "Follow the guide so you know what evidence to look for.",
    "Validate the lab steps in the workspace before writing them up.",
  ].filter(Boolean);
}

function getNextSectionSlug(workflow, sessionCompleted, runtimeReady) {
  const targetSection = workflow.nextRecommendation?.targetSection || "";
  if (targetSection && targetSection !== "overview") {
    return targetSection;
  }

  if (sessionCompleted) {
    return "reports";
  }

  if (runtimeReady) {
    return "workspace";
  }

  return "guide";
}

function getPathStatus(sectionSlug, nextSectionSlug, visitedSections) {
  if (sectionSlug === "overview") {
    return "You are here";
  }

  if (sectionSlug === nextSectionSlug) {
    return "Next";
  }

  if (visitedSections.has(sectionSlug)) {
    return "Visited";
  }

  return "";
}

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
  const sessionCompleted = Boolean(
    sessionRecord?.status === "completed" || sessionRecord?.end_time
  );
  const nextSectionSlug = getNextSectionSlug(
    workflow,
    sessionCompleted,
    runtimeReady
  );
  const primaryActionLabel = sessionCompleted
    ? "Open Reports"
    : getSectionNavigationLabel(nextSectionSlug);
  const primaryActionHref = sessionId
    ? buildSessionPath(sessionId, nextSectionSlug)
    : "/labs";
  const visitedSections = new Set(workflow.visitedSections || []);
  const labDescription =
    activeLabDefinition?.description ||
    activeLabConfig.description ||
    "Read the guide, validate the steps in the workspace, and capture the strongest evidence in reports.";
  const orientationGoals = getOrientationGoals(activeLabDefinition, workflow);
  const activityEntries = workflow.timeline.entries.slice(0, 6);
  const supportSummary = activityEntries.length
    ? `${workflow.timeline.entryCount} activity events`
    : summary.compactEvidenceSummary.length
    ? `${summary.compactEvidenceSummary.length} saved evidence notes`
    : runtimeReady
    ? "Environment details available"
    : "Hidden by default";
  const sessionStateCopy = sessionCompleted
    ? "This session is in review mode. Use reports to review the strongest evidence."
    : runtimeReady
    ? "The live environment is available when you are ready to validate the next step."
    : "The environment has not been launched yet. Start with the guide, then move into the workspace.";

  return (
    <div className="overview-orientation">
      <section className="overview-orientation__hero">
        <div className="content-stack">
          <div>
            <span className="eyebrow">Lab Orientation</span>
            <h1>{activeLabDefinition?.name || activeLabConfig.name}</h1>
          </div>

          <p className="section-lead">{labDescription}</p>

          {orientationGoals.length ? (
            <div className="overview-orientation__goals-block">
              <span className="detail-label">What you will practice</span>
              <ul className="overview-orientation__goals">
                {orientationGoals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overview-orientation__next">
            <span className="detail-label">Next step</span>
            <p>
              <strong>{primaryActionLabel}</strong>
              {workflow.nextRecommendation?.description
                ? `: ${workflow.nextRecommendation.description}`
                : "."}
            </p>
          </div>

          <div className="overview-orientation__cta">
            <Link className="button button--primary" to={primaryActionHref}>
              {primaryActionLabel}
            </Link>
          </div>
        </div>
      </section>

      <section className="overview-path">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Lab Path</span>
            <h2>How this lab flows</h2>
          </div>
        </div>

        <div className="overview-path__grid">
          {SESSION_SECTIONS.map((section) => {
            const status = getPathStatus(
              section.slug,
              nextSectionSlug,
              visitedSections
            );

            return (
              <article
                key={section.slug}
                className={`overview-path__item ${
                  section.slug === "overview"
                    ? "overview-path__item--current"
                    : section.slug === nextSectionSlug
                    ? "overview-path__item--next"
                    : ""
                }`}
              >
                <span className="overview-path__step">
                  Step {section.step}
                </span>
                <h3>{section.label}</h3>
                <p>{section.description}</p>
                {status ? (
                  <span className="overview-path__state">{status}</span>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <details className="overview-support">
        <summary className="overview-support__summary">
          <div>
            <span className="eyebrow">Secondary</span>
            <h2>Session details and activity</h2>
          </div>
          <span>{supportSummary}</span>
        </summary>

        <div className="overview-support__body">
          <div className="overview-support__grid">
            <section className="overview-support__block">
              <span className="detail-label">Session state</span>
              <p>{sessionStateCopy}</p>
              {sessionRecord?.environment_launched_at ? (
                <p>
                  <strong>Launched:</strong>{" "}
                  {new Date(sessionRecord.environment_launched_at).toLocaleString()}
                </p>
              ) : null}
              {labInfo?.browser_url ? (
                <p>
                  <strong>Browser URL:</strong> {labInfo.browser_url}
                </p>
              ) : null}
            </section>

            <section className="overview-support__block">
              <span className="detail-label">Saved evidence</span>
              {summary.compactEvidenceSummary.length ? (
                <div className="overview-support__list">
                  {summary.compactEvidenceSummary.slice(0, 4).map(({ step, progress }) => (
                    <div key={step.task_id} className="overview-support__list-item">
                      <strong>{step.title}</strong>
                      <p>{getEvidencePreview(progress)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>
                  No saved evidence yet. It will appear here after you validate
                  steps in the workspace and capture the strongest results.
                </p>
              )}
            </section>
          </div>

          <section className="overview-support__block overview-support__block--activity">
            <span className="detail-label">Recent session activity</span>
            {activityEntries.length ? (
              <div className="overview-support__timeline">
                {activityEntries.map((entry) => (
                  <article key={entry.key} className="overview-support__timeline-item">
                    <div>
                      <strong>{entry.label}</strong>
                      <p>{entry.detail}</p>
                    </div>
                    <span>
                      {entry.timestampLabel || "Current session state"}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p>
                No session activity yet. Read the guide and move into the
                workspace to start building a trace of the lab.
              </p>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
