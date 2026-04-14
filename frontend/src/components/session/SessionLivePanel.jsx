import { Link } from "react-router-dom";
import LiveTerminal from "../LiveTerminal";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { assessmentMeta } from "../../utils/session";
import { badgeClass } from "./sessionUi";

function ReviewMetric({ label, children }) {
  return (
    <div className="detail-box ai-review-metric">
      <span className="detail-label">{label}</span>
      {children}
    </div>
  );
}

export default function SessionLivePanel() {
  const {
    sessionId,
    terminalFeedback,
    labInfo,
    summary,
    launchingLab,
    launchActiveLab,
    clearFeedback,
    handleTerminalFeedback,
    handleFindingSuggestion,
    handleAutoSavedFinding,
    handleCommandResult,
  } = useSecureStack();

  async function handleLaunch() {
    try {
      await launchActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  const assessment =
    assessmentMeta[terminalFeedback?.assessment] || assessmentMeta.neutral;
  const launchButtonClass = labInfo
    ? "button button--secondary"
    : "button button--primary";

  return (
    <div className="page-stack">
      <section className="surface-card workspace-panel workspace-panel--terminal">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Terminal</h2>
          </div>
          <div className="inline-actions">
            <span className={badgeClass(labInfo ? "success" : "muted")}>
              {labInfo ? "Connected" : "Waiting for launch"}
            </span>
            <button
              type="button"
              className={launchButtonClass}
              onClick={handleLaunch}
              disabled={!sessionId || launchingLab}
            >
              {launchingLab ? "Launching..." : "Launch Environment"}
            </button>
          </div>
        </div>

        <p className="section-lead">
          This is where the guide becomes action. Run commands, inspect the
          output, and use the AI review to decide what belongs in your findings.
        </p>

        <div className="session-inline-meta">
          <span className={badgeClass(labInfo ? "success" : "muted")}>
            {labInfo ? "Environment ready" : "Launch required"}
          </span>
          <span className={badgeClass(terminalFeedback ? "info" : "muted")}>
            {terminalFeedback
              ? "AI reacting to latest command"
              : "AI waiting for command"}
          </span>
          {summary.activeLabStep ? (
            <span className={badgeClass("sky")}>
              Current step: {summary.activeLabStep.title}
            </span>
          ) : null}
        </div>

        {labInfo ? (
          <LiveTerminal
            key={`${sessionId}-${labInfo.attacker_container}`}
            sessionId={sessionId}
            containerLabel={labInfo.attacker_container}
            onFeedback={handleTerminalFeedback}
            onFindingSuggestion={handleFindingSuggestion}
            onFindingAutoSaved={handleAutoSavedFinding}
            onCommandResult={handleCommandResult}
          />
        ) : (
          <div className="empty-card">
            <div className="content-stack">
              <strong>The workspace is waiting for the lab environment</strong>
              <p>
                Review the current guide step, then launch the environment here
                when you are ready to test it live.
              </p>
              <div className="inline-actions">
                <Link
                  className="button button--ghost"
                  to={buildSessionPath(sessionId, "guide")}
                >
                  Review Guide
                </Link>
                <Link
                  className="button button--secondary"
                  to={buildSessionPath(sessionId, "overview")}
                >
                  Back to Overview
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="surface-card workspace-panel workspace-panel--ai">
        <div className="section-heading">
          <div>
            <span className="eyebrow">AI Review</span>
            <h2>Latest Command Review</h2>
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={clearFeedback}
            disabled={!terminalFeedback}
          >
            Clear
          </button>
        </div>

        <p className="section-lead">
          This panel turns the latest command into a quick review so you can
          see what happened, why it matters, and what to do next without
          breaking your flow.
        </p>

        {terminalFeedback ? (
          <div className="content-stack ai-review-layout">
            <div className="ai-review-summary">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Review Summary</span>
                  <h3>{assessment.label}</h3>
                </div>
                <span className={badgeClass(assessment.tone)}>
                  {terminalFeedback.assessment || "Unknown"}
                </span>
              </div>
              <p>{terminalFeedback.explanation || "No explanation available."}</p>
            </div>

            <div className="ai-review-metrics">
              <ReviewMetric label="Assessment">
                <span className={badgeClass(assessment.tone)}>
                  {assessment.label}
                </span>
              </ReviewMetric>
              <ReviewMetric label="Phase">
                <p>{terminalFeedback.phase || "general-navigation"}</p>
              </ReviewMetric>
              <ReviewMetric label="Current guide focus">
                <p>{summary.activeLabStep?.title || "No active guide step"}</p>
              </ReviewMetric>
            </div>

            <div className="panel-grid panel-grid--double ai-review-grid">
              <div className="detail-box ai-review-card">
                <span className="detail-label">Why it matters</span>
                <p>
                  {terminalFeedback.security_relevance ||
                    "No security relevance available."}
                </p>
              </div>

              <div className="detail-box ai-review-card ai-review-card--accent">
                <span className="detail-label">Recommended next move</span>
                <p>{terminalFeedback.next_step || "No next step suggested."}</p>
              </div>
            </div>

            {terminalFeedback.warning ? (
              <div className="callout callout--warning">
                <strong>Watch out:</strong> {terminalFeedback.warning}
              </div>
            ) : null}

            <div className="session-cta-row">
              <Link
                className="button button--ghost"
                to={buildSessionPath(sessionId, "guide")}
              >
                Review Guide
              </Link>
              <Link
                className="button button--primary"
                to={buildSessionPath(sessionId, "reports")}
              >
                Open Reports
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-card ai-review-empty">
            <div className="content-stack">
              <strong>No AI review yet</strong>
              <p>
                After you run a command, this panel will organize the feedback
                into a summary, why it matters, and the recommended next action
                for the current lab step.
              </p>
              <div className="panel-grid panel-grid--double ai-review-grid">
                <div className="detail-box ai-review-card">
                  <span className="detail-label">What will appear here</span>
                  <p>
                    A readable summary of the latest command and how the AI
                    interpreted it against the lab workflow.
                  </p>
                </div>
                <div className="detail-box ai-review-card ai-review-card--accent">
                  <span className="detail-label">Why it helps</span>
                  <p>
                    You will get a clearer next move before jumping into
                    findings or the report section.
                  </p>
                </div>
              </div>
              <div className="inline-actions">
                <Link
                  className="button button--ghost"
                  to={buildSessionPath(sessionId, "guide")}
                >
                  Review Guide
                </Link>
                <Link
                  className="button button--primary"
                  to={buildSessionPath(sessionId, "reports")}
                >
                  Open Reports
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
