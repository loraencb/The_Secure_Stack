import { useEffect, useRef, useState } from "react";
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

const tutorModeMeta = {
  observation: { label: "Observation", tone: "muted" },
  subtle_hint: { label: "Subtle hint", tone: "info" },
  strong_hint: { label: "Stronger hint", tone: "warning" },
  near_complete_guidance: { label: "Near-complete guidance", tone: "danger" },
  redirect: { label: "Redirect", tone: "warning" },
  success_explanation: { label: "Learning reinforcement", tone: "success" },
};
const tutorAskOptions = [
  { intent: "hint", label: "Give me a hint" },
  { intent: "explain", label: "Explain this step" },
  { intent: "stuck", label: "I'm stuck" },
  { intent: "what_next", label: "What should I do next?" },
];

export default function SessionLivePanel() {
  const {
    sessionId,
    sessionRecord,
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
  const liveTerminalRef = useRef(null);
  const [requestingTutorIntent, setRequestingTutorIntent] = useState("");
  const [tutorActionError, setTutorActionError] = useState("");

  useEffect(() => {
    if (
      requestingTutorIntent &&
      terminalFeedback?.response_origin === "ask_tutor"
    ) {
      setRequestingTutorIntent("");
    }
  }, [requestingTutorIntent, terminalFeedback]);

  async function handleLaunch() {
    try {
      await launchActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleAskTutor(intent) {
    if (!environmentReady || sessionCompleted) {
      return;
    }

    try {
      const terminalHandle = liveTerminalRef.current;
      if (!terminalHandle?.requestTutorHelp) {
        throw new Error(
          "The tutor is only available after the live workspace finishes connecting."
        );
      }

      setTutorActionError("");
      setRequestingTutorIntent(intent);
      terminalHandle.requestTutorHelp(intent);
    } catch (error) {
      setRequestingTutorIntent("");
      setTutorActionError(
        error.message || "The tutor is unavailable until the live workspace is connected."
      );
    }
  }

  const assessment =
    assessmentMeta[terminalFeedback?.assessment] || assessmentMeta.neutral;
  const tutorMode =
    tutorModeMeta[terminalFeedback?.tutor_mode] || tutorModeMeta.observation;
  const hintLevel = Number(terminalFeedback?.hint_level || 0);
  const hintTone =
    hintLevel >= 3
      ? "danger"
      : hintLevel === 2
      ? "warning"
      : hintLevel === 1
      ? "info"
      : "muted";
  const environmentReady = workflow.environmentLaunched;
  const sessionCompleted = Boolean(
    sessionRecord?.status === "completed" || sessionRecord?.end_time
  );
  const runtimeContainerLabel =
    labInfo?.attacker_container || (sessionId ? `attacker-${sessionId}` : "workspace");
  const launchButtonClass = environmentReady
    ? "button button--secondary"
    : "button button--primary";
  const workspaceLead = sessionCompleted
    ? "This session has been completed and the live environment was cleaned up. Use the saved evidence, findings, and report space for review, or start a new session for another lab run."
    : !workflow.environmentLaunched
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
  const activeTutorRequestLabel =
    tutorAskOptions.find((option) => option.intent === requestingTutorIntent)
      ?.label || "Requesting tutor help";

  function renderTutorActions() {
    return (
      <div className="detail-box detail-box--tertiary tutor-actions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Ask Tutor</span>
            <h3>Need a nudge on this step?</h3>
          </div>
          <span
            className={badgeClass(
              environmentReady && !sessionCompleted ? "info" : "muted"
            )}
          >
            {environmentReady && !sessionCompleted
              ? "Adaptive help"
              : "Unavailable"}
          </span>
        </div>
        <p className="section-lead">
          Ask for a hint, a concept explanation, stuck support, or the next move.
          The tutor uses the same progressive guidance ladder it already applies
          when you struggle in the terminal.
        </p>
        <div className="tutor-actions__buttons">
          {tutorAskOptions.map((option) => (
            <button
              key={option.intent}
              type="button"
              className={
                requestingTutorIntent === option.intent
                  ? "button button--secondary tutor-actions__button"
                  : "button button--ghost tutor-actions__button"
              }
              onClick={() => handleAskTutor(option.intent)}
              disabled={
                !environmentReady || sessionCompleted || Boolean(requestingTutorIntent)
              }
            >
              {requestingTutorIntent === option.intent
                ? "Asking..."
                : option.label}
            </button>
          ))}
        </div>

        {requestingTutorIntent ? (
          <div className="callout callout--info">
            <strong>Request sent:</strong> {activeTutorRequestLabel}
          </div>
        ) : null}

        {terminalFeedback?.response_origin === "ask_tutor" &&
        terminalFeedback.ask_label ? (
          <div className="tutor-actions__meta">
            <span className={badgeClass("sky")}>
              Last tutor request: {terminalFeedback.ask_label}
            </span>
            <span className={badgeClass(hintTone)}>
              {terminalFeedback.hint_label ||
                (hintLevel ? `Level ${hintLevel}` : "Observation")}
            </span>
          </div>
        ) : null}

        {tutorActionError ? (
          <div className="callout callout--warning">
            <strong>Tutor unavailable:</strong> {tutorActionError}
          </div>
        ) : null}
      </div>
    );
  }

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
              disabled={!sessionId || launchingLab || sessionCompleted}
            >
              {launchingLab ? "Launching..." : "Launch Environment"}
            </button>
          </div>
        </div>

        <p className="section-lead">{workspaceLead}</p>

        <div className="session-inline-meta">
          <span className={badgeClass(environmentReady ? "success" : "muted")}>
            {environmentReady
              ? "Environment ready"
              : sessionCompleted
              ? "Environment cleaned up"
              : "Launch required"}
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
            ref={liveTerminalRef}
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
              <strong>
                {sessionCompleted
                  ? "This session is now in review mode"
                  : "The workspace is waiting for the lab environment"}
              </strong>
              <p>
                {sessionCompleted
                  ? "The runtime was cleaned up when the session ended or was torn down. Review the guide, findings, or report, or start a new session to relaunch a live environment."
                  : workflow.nextRecommendation.description}
              </p>
              <div className="inline-actions">
                <Link
                  className="button button--ghost"
                  to={buildSessionPath(sessionId, "guide")}
                >
                  Review Guide
                </Link>
                {sessionCompleted ? (
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "reports")}
                  >
                    Open Reports
                  </Link>
                ) : (
                  <Link
                    className="button button--secondary"
                    to={buildSessionPath(sessionId, "overview")}
                  >
                    Back to Overview
                  </Link>
                )}
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

        {renderTutorActions()}

        {terminalFeedback ? (
          <div className="content-stack ai-review-layout">
            <div className="ai-review-summary">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Review Summary</span>
                  <h3>{assessment.label}</h3>
                </div>
                <div className="inline-actions">
                  {terminalFeedback.response_origin === "ask_tutor" &&
                  terminalFeedback.ask_label ? (
                    <span className={badgeClass("sky")}>
                      {terminalFeedback.ask_label}
                    </span>
                  ) : null}
                  <span className={badgeClass(assessment.tone)}>
                    {terminalFeedback.assessment || "Unknown"}
                  </span>
                </div>
              </div>
              <p>{terminalFeedback.explanation || "No explanation available."}</p>
            </div>

            <div className="ai-review-metrics">
              {terminalFeedback.response_origin === "ask_tutor" &&
              terminalFeedback.ask_label ? (
                <ReviewMetric label="Tutor request">
                  <p>{terminalFeedback.ask_label}</p>
                </ReviewMetric>
              ) : null}
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
              <ReviewMetric label="Guidance level">
                <span className={badgeClass(hintTone)}>
                  {terminalFeedback.hint_label ||
                    (hintLevel ? `Level ${hintLevel}` : "Observation")}
                </span>
              </ReviewMetric>
              <ReviewMetric label="Tutor mode">
                <span className={badgeClass(tutorMode.tone)}>
                  {tutorMode.label}
                </span>
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

            {terminalFeedback.learning_reinforcement ? (
              <div className="detail-box ai-review-card">
                <span className="detail-label">Learning connection</span>
                <p>{terminalFeedback.learning_reinforcement}</p>
              </div>
            ) : null}

            {terminalFeedback.warning ? (
              <div className="callout callout--warning">
                <strong>Watch out:</strong> {terminalFeedback.warning}
              </div>
            ) : null}

            {terminalFeedback.off_track_detected ? (
              <div className="callout callout--info">
                <strong>Redirect:</strong> The tutor has pulled the focus back to
                the current step so the evidence trail stays aligned with the
                guide.
              </div>
            ) : null}

            {terminalFeedback.stuck_detected ? (
              <div className="callout callout--warning">
                <strong>Escalated help:</strong> The tutor is increasing the
                amount of guidance because this step still looks stuck.
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
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => handleAskTutor("hint")}
                  disabled={
                    !environmentReady || sessionCompleted || Boolean(requestingTutorIntent)
                  }
                >
                  {requestingTutorIntent === "hint" ? "Asking..." : "Ask Tutor"}
                </button>
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
