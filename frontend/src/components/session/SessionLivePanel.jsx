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
    workflow,
    launchingLab,
    launchActiveLab,
    clearFeedback,
    handleCommandSubmitted,
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
  const environmentReady = workflow.environmentLaunched;
  const runtimeContainerLabel =
    labInfo?.attacker_container || (sessionId ? `attacker-${sessionId}` : "workspace");
  const launchButtonClass = environmentReady
    ? "button button--secondary"
    : "button button--primary";
  const workspaceLead = !workflow.environmentLaunched
    ? workflow.nextRecommendation.description
    : workflow.readyForReport
    ? "You have saved findings ready for reporting. Keep validating here or move to Reports to generate the session summary."
    : workflow.needsEvidenceContext
    ? "You already have saved findings, but the report still needs stronger task-linked evidence. Capture one clearer command-backed observation before wrapping up."
    : workflow.canCaptureEvidence
    ? "Command activity has been captured for this session. Save the strongest evidence as a finding when it is ready."
    : "This is where the guide becomes action. Run commands, inspect the output, and use the AI review to decide what belongs in your findings.";
  const aiReviewLead = workflow.hasCommandActivity
    ? "The latest command review helps you decide whether the evidence is strong enough to save as a finding or whether the active step needs another pass."
    : "This panel turns the latest command into a quick review so you can see what happened, why it matters, and what to do next without breaking your flow.";

  return (
    <div className="page-stack">
      <section className="surface-card workspace-panel workspace-panel--terminal">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Terminal</h2>
          </div>
          <div className="inline-actions">
            <span className={badgeClass(environmentReady ? "success" : "muted")}>
              {environmentReady ? "Connected" : "Waiting for launch"}
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

        <p className="section-lead">{workspaceLead}</p>

        <div className="session-inline-meta">
          <span className={badgeClass(environmentReady ? "success" : "muted")}>
            {environmentReady ? "Environment ready" : "Launch required"}
          </span>
          <span className={badgeClass(terminalFeedback ? "info" : "muted")}>
            {terminalFeedback
              ? "AI reacting to latest command"
              : "AI waiting for command"}
          </span>
          <span
            className={badgeClass(
              workflow.hasCommandActivity ? "info" : "muted"
            )}
          >
            {workflow.hasCommandActivity
              ? `${workflow.commandsRunCount} commands captured`
              : "No command activity yet"}
          </span>
          {summary.activeLabStep ? (
            <span className={badgeClass("sky")}>
              Current step: {workflow.currentTaskLabel}
            </span>
          ) : null}
        </div>

        {environmentReady ? (
          <LiveTerminal
            key={`${sessionId}-${runtimeContainerLabel}`}
            sessionId={sessionId}
            containerLabel={runtimeContainerLabel}
            onFeedback={handleTerminalFeedback}
            onCommandSubmitted={handleCommandSubmitted}
            onFindingSuggestion={handleFindingSuggestion}
            onFindingAutoSaved={handleAutoSavedFinding}
            onCommandResult={handleCommandResult}
          />
        ) : (
          <div className="empty-card">
            <div className="content-stack">
              <strong>The workspace is waiting for the lab environment</strong>
              <p>{workflow.nextRecommendation.description}</p>
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

        <p className="section-lead">{aiReviewLead}</p>

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
                <p>{workflow.currentTaskLabel}</p>
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
                {workflow.hasCommandActivity
                  ? "The session has command activity, but there is no current AI review visible. Run another command or return to the guide if you need to realign the active step."
                  : "After you run a command, this panel will organize the feedback into a summary, why it matters, and the recommended next action for the current lab step."}
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
