export { default } from "./SessionShell";
/*
import { Link, useNavigate } from "react-router-dom";
import LiveTerminal from "../LiveTerminal";
import StatusBanner from "../StatusBanner";
import { useSecureStack } from "../../context/SecureStackContext";
import {
  aiStatusMeta,
  assessmentMeta,
  evidenceQualityMeta,
  getEvidencePreview,
  taskStatusMeta,
} from "../../utils/session";

function badgeClass(tone = "muted") {
  return `badge badge--${tone}`;
}

export default function SessionWorkspace() {
  const navigate = useNavigate();
  const {
    activeLabConfig,
    activeLabDefinition,
    sessionId,
    message,
    clearMessage,
    terminalFeedback,
    findingSuggestion,
    labInfo,
    startingSession,
    launchingLab,
    labSteps,
    taskProgress,
    summary,
    startNewSession,
    launchActiveLab,
    clearFeedback,
    handleTerminalFeedback,
    handleFindingSuggestion,
    handleAutoSavedFinding,
    handleCommandResult,
    completeBrowserStep,
    acceptSuggestedFinding,
    acceptingSuggestion,
    dismissSuggestedFinding,
  } = useSecureStack();

  async function handleStartFreshSession() {
    try {
      const result = await startNewSession(activeLabConfig.labId);
      if (result?.id) {
        navigate(`/session/${result.id}`);
      }
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleLaunch() {
    try {
      await launchActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  async function handleAcceptFinding() {
    try {
      await acceptSuggestedFinding();
    } catch {
      // Message state is handled in shared context.
    }
  }

  return (
    <div className="page-stack">
      <section className="hero hero--session">
        <div className="hero__content">
          <div className="hero__eyebrow">Session Workspace</div>
          <h1>{activeLabDefinition?.name || activeLabConfig.name}</h1>
          <p>
            Run the guided terminal workflow, capture findings, and move through
            the lab one task at a time.
          </p>
        </div>

        <div className="hero__panel">
          <div className="hero__metric">
            <span>Session</span>
            <strong>{sessionId ? `#${sessionId}` : "Not started"}</strong>
          </div>
          <div className="hero__metric">
            <span>Progress</span>
            <strong>{summary.progressPercent}% complete</strong>
          </div>
          <div className="hero__metric">
            <span>Current task</span>
            <strong>
              {summary.activeLabStep?.title || "Launch and begin the lab"}
            </strong>
          </div>
        </div>
      </section>

      <div className="action-strip">
        <button
          type="button"
          className="button button--primary"
          onClick={handleStartFreshSession}
          disabled={startingSession}
        >
          {startingSession ? "Starting..." : "Start New Session"}
        </button>

        <button
          type="button"
          className="button button--secondary"
          onClick={handleLaunch}
          disabled={!sessionId || launchingLab}
        >
          {launchingLab
            ? "Launching..."
            : `Launch ${activeLabDefinition?.name || "Lab"}`}
        </button>

        <Link className="button button--ghost" to="/reports">
          View Reports
        </Link>
      </div>

      <StatusBanner message={message} onDismiss={clearMessage} />

      <div className="workspace-grid">
        <div className="workspace-grid__main">
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Live Environment</span>
                <h2>Terminal</h2>
              </div>
              <span className={badgeClass(labInfo ? "success" : "muted")}>
                {labInfo ? "Connected" : "Waiting for launch"}
              </span>
            </div>

            {labInfo ? (
              <LiveTerminal
                key={`${sessionId}-${labInfo.attacker_container}`}
                sessionId={sessionId}
                onFeedback={handleTerminalFeedback}
                onFindingSuggestion={handleFindingSuggestion}
                onFindingAutoSaved={handleAutoSavedFinding}
                onCommandResult={handleCommandResult}
              />
            ) : (
              <div className="empty-card">
                Launch the lab to open the shell and begin the interactive
                workflow.
              </div>
            )}
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">AI Guidance</span>
                <h2>Live Review</h2>
              </div>
              <button
                type="button"
                className="button button--ghost"
                onClick={clearFeedback}
              >
                Clear
              </button>
            </div>

            {terminalFeedback ? (
              <div className="content-stack">
                <div className="detail-grid detail-grid--two">
                  <div className="detail-box">
                    <span className="detail-label">Assessment</span>
                    <span
                      className={badgeClass(
                        assessmentMeta[terminalFeedback.assessment]?.tone || "info"
                      )}
                    >
                      {terminalFeedback.assessment || "Unknown"}
                    </span>
                  </div>
                  <div className="detail-box">
                    <span className="detail-label">Phase</span>
                    <strong>{terminalFeedback.phase || "general-navigation"}</strong>
                  </div>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Explanation</span>
                  <p>{terminalFeedback.explanation || "No explanation available."}</p>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Security Relevance</span>
                  <p>
                    {terminalFeedback.security_relevance ||
                      "No security relevance available."}
                  </p>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Next Step</span>
                  <p>{terminalFeedback.next_step || "No next step suggested."}</p>
                </div>

                {terminalFeedback.warning ? (
                  <div className="callout callout--warning">
                    <strong>Warning:</strong> {terminalFeedback.warning}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-card">
                Run a command in the terminal to receive AI guidance here.
              </div>
            )}
          </section>
        </div>

        <div className="workspace-grid__side">
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Current Session</span>
                <h2>Learner Summary</h2>
              </div>
            </div>

            <div className="progress-ring-card">
              <div className="progress-ring">
                <strong>{summary.progressPercent}%</strong>
                <span>complete</span>
              </div>

              <div className="content-stack">
                <div className="detail-box">
                  <span className="detail-label">Current task</span>
                  <p>{summary.activeLabStep?.title || "All tasks completed"}</p>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Recommended next action</span>
                  <p>{summary.recommendedNextAction}</p>
                </div>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total Tasks</span>
                <strong>{summary.totalSteps}</strong>
              </div>
              <div className="stat-card">
                <span>Completed</span>
                <strong>{summary.completedSteps.length}</strong>
              </div>
              <div className="stat-card">
                <span>Needs Evidence</span>
                <strong>{summary.insufficientTasksCount}</strong>
              </div>
              <div className="stat-card">
                <span>Off Track</span>
                <strong>{summary.offTrackAttemptsCount}</strong>
              </div>
            </div>

            <div className="detail-box">
              <span className="detail-label">Completed evidence summary</span>
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
                <p>
                  Completed-task evidence will appear here as the learner
                  progresses.
                </p>
              )}
            </div>
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Environment</span>
                <h2>Session Status</h2>
              </div>
              <span className={badgeClass(sessionId ? "success" : "muted")}>
                {sessionId ? "Active" : "Idle"}
              </span>
            </div>

            <div className="detail-grid detail-grid--two">
              <div className="detail-box">
                <span className="detail-label">Lab</span>
                <strong>{activeLabDefinition?.name || activeLabConfig.name}</strong>
              </div>
              <div className="detail-box">
                <span className="detail-label">Session ID</span>
                <strong>{sessionId || "None"}</strong>
              </div>
              <div className="detail-box">
                <span className="detail-label">Findings</span>
                <strong>{summary.sortedFindings.length}</strong>
              </div>
              <div className="detail-box">
                <span className="detail-label">AI Status</span>
                <strong>
                  {labInfo ? (terminalFeedback ? "Live" : "Ready") : "Waiting"}
                </strong>
              </div>
            </div>

            {labInfo ? (
              <div className="content-stack">
                <div className="detail-box">
                  <span className="detail-label">Attacker</span>
                  <strong>{labInfo.attacker_container}</strong>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Target</span>
                  <strong>{labInfo.target_container}</strong>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Network</span>
                  <strong>{labInfo.network_name}</strong>
                </div>
                {labInfo.browser_url ? (
                  <div className="detail-box">
                    <span className="detail-label">Browser URL</span>
                    <strong>{labInfo.browser_url}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
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
              <div className="content-stack">
                <p>{activeLabDefinition.description || "No lab description available."}</p>

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
              </div>
            ) : (
              <div className="empty-card">Loading lab module definition.</div>
            )}
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Task Guide</span>
                <h2>Guided Workflow</h2>
              </div>
              <span className="section-note">
                {activeLabDefinition?.estimated_duration_minutes
                  ? `${activeLabDefinition.estimated_duration_minutes} min estimate`
                  : "Step-by-step instructions"}
              </span>
            </div>

            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{ width: `${summary.progressPercent}%` }}
              />
            </div>
            <p className="progress-copy">{summary.progressPercent}% complete</p>

            {summary.activeLabStep && summary.activeTaskProgress?.ai_feedback ? (
              <div className="callout callout--info">
                <strong>Active task feedback:</strong>{" "}
                {summary.activeTaskProgress.ai_feedback}
              </div>
            ) : null}

            <div className="content-stack">
              {labSteps?.length ? (
                labSteps.map((step, index) => {
                  const stepProgress = taskProgress[step.task_id];
                  const isCompleted = summary.completedSteps.includes(index);
                  const isActive = index === summary.currentLabStepIndex;
                  const displayStatus = isCompleted
                    ? "completed"
                    : stepProgress?.status === "off_track"
                    ? "off_track"
                    : stepProgress?.status === "attempted"
                    ? "attempted"
                    : isActive
                    ? "current"
                    : "pending";
                  const status = taskStatusMeta[displayStatus];
                  const stepAi = stepProgress?.ai_status
                    ? aiStatusMeta[stepProgress.ai_status]
                    : null;
                  const evidence = stepProgress?.evidence_quality
                    ? evidenceQualityMeta[stepProgress.evidence_quality]
                    : null;

                  return (
                    <article
                      key={step.task_id || `${step.title}-${index}`}
                      className={`task-card${isActive ? " task-card--active" : ""}${
                        isCompleted ? " task-card--complete" : ""
                      }`}
                    >
                      <div className="task-card__header">
                        <div>
                          <span className="task-card__step">Step {index + 1}</span>
                          <h3>{step.title}</h3>
                        </div>
                        <span className={badgeClass(status.tone)}>
                          {status.label}
                        </span>
                      </div>

                      <p>{step.instruction}</p>

                      {step.command_hint ? (
                        <code className="command-pill">{step.command_hint}</code>
                      ) : null}

                      {stepAi || evidence ? (
                        <div className="tag-row">
                          {stepAi ? (
                            <span className={badgeClass(stepAi.tone)}>
                              {stepAi.label}
                            </span>
                          ) : null}
                          {evidence ? (
                            <span className={badgeClass(evidence.tone)}>
                              {evidence.label}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {stepProgress?.ai_feedback ? (
                        <div className="detail-box">
                          <span className="detail-label">Task Evaluation</span>
                          <p>{stepProgress.ai_feedback}</p>
                        </div>
                      ) : null}

                      {stepProgress?.evidence_command || stepProgress?.ai_confidence ? (
                        <div className="detail-box">
                          <span className="detail-label">Evidence Review</span>
                          {stepProgress?.evidence_command ? (
                            <p>
                              <strong>Command:</strong> {stepProgress.evidence_command}
                            </p>
                          ) : null}
                          {stepProgress?.ai_confidence ? (
                            <p>
                              <strong>Confidence:</strong> {stepProgress.ai_confidence}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {step.hint_text ? (
                        <div className="detail-box">
                          <span className="detail-label">Hint</span>
                          <p>{step.hint_text}</p>
                        </div>
                      ) : null}

                      {step.remediation_text ? (
                        <div className="detail-box">
                          <span className="detail-label">Remediation Guidance</span>
                          <p>{step.remediation_text}</p>
                        </div>
                      ) : null}

                      {step.success_criteria?.length ? (
                        <div className="detail-box">
                          <span className="detail-label">Success Criteria</span>
                          <ul className="detail-list">
                            {step.success_criteria.map((criterion) => (
                              <li key={criterion}>{criterion}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {isActive && step.step_type === "browser" ? (
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={completeBrowserStep}
                          >
                            {step.manual_confirmation_label ||
                              "Mark Browser Step Complete"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="empty-card">
                  The guided task list will appear here after the lab definition
                  loads.
                </div>
              )}
            </div>
          </section>

          {findingSuggestion ? (
            <section className="surface-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AI Finding</span>
                  <h2>Suggested Finding</h2>
                </div>
                <span className={badgeClass("info")}>Terminal signal</span>
              </div>

              <div className="content-stack">
                <div className="detail-box">
                  <span className="detail-label">Title</span>
                  <p>{findingSuggestion.title || "Untitled finding"}</p>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Severity</span>
                  <span
                    className={badgeClass(
                      findingSuggestion.severity === "High"
                        ? "danger"
                        : findingSuggestion.severity === "Low"
                        ? "success"
                        : "warning"
                    )}
                  >
                    {findingSuggestion.severity || "Medium"}
                  </span>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Description</span>
                  <p>
                    {findingSuggestion.description || "No description available."}
                  </p>
                </div>

                <div className="detail-box">
                  <span className="detail-label">Evidence</span>
                  <pre className="terminal-evidence">
                    {findingSuggestion.evidence || "No evidence provided."}
                  </pre>
                </div>

                <div className="inline-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={handleAcceptFinding}
                    disabled={!sessionId || acceptingSuggestion}
                  >
                    {acceptingSuggestion ? "Saving..." : "Accept Finding"}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={dismissSuggestedFinding}
                    disabled={acceptingSuggestion}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
*/
