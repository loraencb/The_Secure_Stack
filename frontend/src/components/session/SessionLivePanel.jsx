import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import LiveTerminal from "../LiveTerminal";
import { useSecureStack } from "../../context/SecureStackContext";
import { buildSessionPath } from "../../utils/routes";
import { assessmentMeta } from "../../utils/session";
import { badgeClass, getFindingSeverityTone } from "./sessionUi";

const tutorAskOptions = [
  { intent: "hint", label: "Give me a hint", shortLabel: "Hint" },
  { intent: "explain", label: "Explain this step", shortLabel: "Explain" },
  { intent: "stuck", label: "I'm stuck", shortLabel: "Stuck" },
  { intent: "what_next", label: "What should I do next?", shortLabel: "Next" },
];
const visibleInterventionLabels = {
  "Idle nudge": "Check-in",
  "Off-track redirect": "Course correction",
  "Browser handoff": "Browser step",
};
const IDLE_CHECK_INTERVAL_MS = 15000;
const IDLE_BASE_THRESHOLD_MS = 90000;
const IDLE_STRUGGLE_THRESHOLD_MS = 60000;
const IDLE_AFTER_GUIDANCE_THRESHOLD_MS = 75000;
const IDLE_BROWSER_THRESHOLD_MS = 45000;
const IDLE_REPEAT_THRESHOLD_MS = 180000;
const RECENT_TUTOR_COOLDOWN_MS = 75000;
const RECENT_STRONG_GUIDANCE_COOLDOWN_MS = 120000;

function getGuideHints(step) {
  if (Array.isArray(step?.hints) && step.hints.length) {
    return step.hints;
  }

  if (step?.hint_text) {
    return [step.hint_text];
  }

  return [];
}

function getTutorPlaceholder() {
  return "Ask anything or paste what you saw...";
}

function getTutorPendingCopy(source) {
  if (source === "command_review") {
    return "Tutor is sizing up your latest move...";
  }

  if (source === "idle_observer") {
    return "Tutor is checking the current step...";
  }

  if (source === "tutor_chat") {
    return "Tutor is thinking through your question...";
  }

  if (source === "ask_tutor") {
    return "Tutor is lining up the next hint...";
  }

  return "Tutor is thinking...";
}

function toTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLastConversationEntry(conversation = [], role = "tutor") {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index]?.role === role) {
      return conversation[index];
    }
  }

  return null;
}

function getTutorMessageOriginLabel(message) {
  return message.role === "student" ? "You" : "Tutor";
}

function getTutorMessageSupportLine(message) {
  if (!message || message.role === "student") {
    return null;
  }

  if (message.warning) {
    return {
      label: "Watch out",
      text: message.warning,
      tone: "warning",
    };
  }

  if (message.nextStep) {
    return {
      label: "Next move",
      text: message.nextStep,
      tone: "info",
    };
  }

  if (message.learningReinforcement) {
    return {
      label: "What this proved",
      text: message.learningReinforcement,
      tone: "success",
    };
  }

  if (message.detail) {
    return {
      label: "Why it matters",
      text: message.detail,
      tone: "muted",
    };
  }

  return null;
}

function getObservationFocus(step) {
  if (Array.isArray(step?.what_to_observe) && step.what_to_observe.length) {
    return step.what_to_observe;
  }

  if (Array.isArray(step?.expected_evidence) && step.expected_evidence.length) {
    return step.expected_evidence;
  }

  return [];
}

function formatTutorTimestamp(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function TutorChatMessage({ message }) {
  const isStudent = message.role === "student";
  const supportLine = getTutorMessageSupportLine(message);
  const secondaryLabel = !isStudent && message.askLabel
    ? message.askLabel
    : !isStudent && visibleInterventionLabels[message.interventionLabel]
    ? visibleInterventionLabels[message.interventionLabel]
    : "";
  const timestampLabel = formatTutorTimestamp(message.createdAt);

  return (
    <article
      className={`tutor-chat__message tutor-chat__message--${
        isStudent ? "student" : "tutor"
      }`}
    >
      {!isStudent ? (
        <span className="tutor-chat__avatar" aria-hidden="true">
          T
        </span>
      ) : null}
      <div className="tutor-chat__message-body">
        <div className="tutor-chat__meta">
          <span className="tutor-chat__speaker">
            {getTutorMessageOriginLabel(message)}
          </span>
          {secondaryLabel && !isStudent ? (
            <span className="tutor-chat__context">{secondaryLabel}</span>
          ) : null}
          {timestampLabel ? (
            <time className="tutor-chat__time" dateTime={message.createdAt}>
              {timestampLabel}
            </time>
          ) : null}
        </div>

        <div className="tutor-chat__bubble">
          {message.title && (!isStudent || message.title !== message.content) ? (
            <h3>{message.title}</h3>
          ) : null}

          <div className="tutor-chat__content">{message.content}</div>

          {!isStudent && supportLine ? (
            <div className="tutor-chat__followup">
              <p
                className={`tutor-chat__support tutor-chat__support--${supportLine.tone}`}
              >
                <strong>{supportLine.label}:</strong> {supportLine.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function SessionLivePanel() {
  const {
    sessionId,
    sessionRecord,
    terminalFeedback,
    findingSuggestion,
    labInfo,
    summary,
    workflow,
    tutorPending,
    launchingLab,
    acceptingSuggestion,
    launchActiveLab,
    acceptSuggestedFinding,
    dismissSuggestedFinding,
    clearFeedback,
    handleTutorPendingChange,
    recordTutorQuestion,
    handleCommandSubmitted,
    handleTerminalFeedback,
    handleFindingSuggestion,
    handleAutoSavedFinding,
    handleCommandResult,
  } = useSecureStack();
  const liveTerminalRef = useRef(null);
  const tutorThreadRef = useRef(null);
  const idleObserverRef = useRef({
    lastNudgeAt: 0,
    lastNudgedStepId: "",
    nudgeCountByStep: {},
  });
  const [tutorDraft, setTutorDraft] = useState("");
  const [sendingTutorRequest, setSendingTutorRequest] = useState(false);
  const [tutorActionError, setTutorActionError] = useState("");
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);

  useEffect(() => {
    if (sendingTutorRequest && !tutorPending.active) {
      setSendingTutorRequest(false);
    }
  }, [sendingTutorRequest, tutorPending.active]);

  useEffect(() => {
    if (!tutorThreadRef.current) {
      return;
    }

    tutorThreadRef.current.scrollTop = tutorThreadRef.current.scrollHeight;
  }, [workflow.tutorConversation, tutorPending.active]);

  async function handleLaunch() {
    try {
      await launchActiveLab();
    } catch {
      // Message state is handled in shared context.
    }
  }

  function buildTutorHistoryPayload() {
    return (workflow.tutorConversation || []).slice(-8).map((entry) => ({
      role: entry.role === "student" ? "student" : "tutor",
      content: entry.content,
    }));
  }

  async function sendTutorRequest({
    intent = "",
    message = "",
    label = "",
    recordQuestion = true,
    pendingSource = "",
  } = {}) {
    if (!environmentReady || sessionCompleted) {
      return;
    }

    try {
      const terminalHandle = liveTerminalRef.current;
      if (!terminalHandle?.sendTutorMessage) {
        throw new Error(
          "The tutor becomes available after the live workspace finishes connecting."
        );
      }

      const trimmedMessage = message.trim();
      const resolvedIntent = intent || "";
      const resolvedLabel =
        label ||
        tutorAskOptions.find((option) => option.intent === resolvedIntent)?.label ||
        "Question for tutor";

      setTutorActionError("");
      setSendingTutorRequest(true);

      terminalHandle.sendTutorMessage({
        intent: resolvedIntent,
        message: trimmedMessage,
        history: buildTutorHistoryPayload(),
        source: pendingSource,
      });

      if (recordQuestion) {
        recordTutorQuestion({
          content: trimmedMessage || resolvedLabel,
          intent: resolvedIntent,
          label: resolvedLabel,
        });
      }

      if (trimmedMessage) {
        setTutorDraft("");
      }
    } catch (error) {
      setSendingTutorRequest(false);
      setTutorActionError(
        error.message || "The tutor is unavailable until the live workspace is connected."
      );
    }
  }

  async function handleAskTutor(intent) {
    const option = tutorAskOptions.find((item) => item.intent === intent);
    await sendTutorRequest({
      intent,
      label: option?.label || "Tutor help",
    });
  }

  async function handleTutorSubmit(event) {
    event.preventDefault();

    if (!tutorDraft.trim()) {
      return;
    }

    await sendTutorRequest({
      message: tutorDraft,
      label: "Question for tutor",
    });
  }

  function handleTutorDraftKeyDown(event) {
    if (event.nativeEvent?.isComposing) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    if (!tutorDraft.trim() || !environmentReady || sessionCompleted || tutorBusy) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function handleAcceptFinding() {
    try {
      await acceptSuggestedFinding();
    } catch {
      // Message state is handled in shared context.
    }
  }

  const assessment =
    assessmentMeta[terminalFeedback?.assessment] || assessmentMeta.neutral;
  const environmentReady = workflow.environmentLaunched;
  const sessionCompleted = Boolean(
    sessionRecord?.status === "completed" || sessionRecord?.end_time
  );
  const activeStep = summary.activeLabStep;
  const latestStepTakeaway =
    !workflow.labCompleted && workflow.latestStepTakeaway
      ? workflow.latestStepTakeaway
      : null;
  const labDebrief = workflow.labDebrief;
  const stepObjective =
    workflow.currentTaskObjective ||
    activeStep?.objective ||
    activeStep?.instruction ||
    "Review the guide to understand the current task objective.";
  const stepInstruction =
    activeStep?.command_hint ||
    (activeStep?.step_type === "browser" && labInfo?.browser_url
      ? labInfo.browser_url
      : "") ||
    activeStep?.instruction ||
    (workflow.labCompleted
      ? labDebrief?.reflectionPrompt || workflow.nextRecommendation.description
      : "") ||
    summary.recommendedNextAction ||
    workflow.nextRecommendation.description;
  const stepExplanation =
    activeStep?.explanation ||
    activeStep?.objective ||
    (workflow.labCompleted ? labDebrief?.summary || "" : "");
  const stepExpectedOutcome =
    activeStep?.expected_outcome ||
    activeStep?.success_criteria?.[0] ||
    "";
  const stepObservationFocus = getObservationFocus(activeStep);
  const primaryObservationCue = stepObservationFocus[0] || "";
  const stepDoNow =
    stepInstruction ||
    summary.recommendedNextAction ||
    workflow.nextRecommendation.description;
  const stepWhyObservationMatters =
    activeStep?.why_observation_matters || activeStep?.learning_takeaway || "";
  const stepHints = getGuideHints(activeStep);
  const hasExpandedStepDetails = Boolean(
    activeStep &&
      (
        stepExplanation ||
        stepExpectedOutcome ||
        stepHints.length ||
        stepObservationFocus.length ||
        stepWhyObservationMatters
      )
  );
  const stepCounterLabel = workflow.labCompleted
    ? "Lab complete"
    : `Step ${summary.currentLabStepIndex + 1} of ${summary.totalSteps}`;
  const terminalSessionKey =
    labInfo?.attacker_container || (sessionId ? `workspace-${sessionId}` : "workspace");
  const tutorConversation = workflow.tutorConversation || [];
  const tutorBusy = Boolean(tutorPending.active || sendingTutorRequest);
  const lastTutorMessage = getLastConversationEntry(tutorConversation, "tutor");
  const lastStudentMessage = getLastConversationEntry(tutorConversation, "student");

  useEffect(() => {
    if (findingSuggestion || labDebrief) {
      setSupportPanelOpen(true);
    }
  }, [findingSuggestion, labDebrief]);

  useEffect(() => {
    if (!environmentReady || sessionCompleted || tutorBusy || !activeStep) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const stepKey =
        activeStep?.task_id || activeStep?.title || `step-${summary.currentLabStepIndex}`;
      const lastTutorMessageAt = toTimestamp(lastTutorMessage?.createdAt);
      const lastStudentMessageAt = toTimestamp(lastStudentMessage?.createdAt);
      const lastCommandAt = toTimestamp(workflow.lastCommandAt);
      const lastFeedbackAt = toTimestamp(workflow.lastFeedbackAt);
      const launchedAt = toTimestamp(sessionRecord?.environment_launched_at);
      const lastTutorActivityAt = Math.max(lastTutorMessageAt, lastFeedbackAt);
      const latestActivityAt = Math.max(
        lastCommandAt,
        lastStudentMessageAt,
        launchedAt
      );
      const currentStatus = workflow.currentTaskStatus;
      const recentlyGuidedWithoutAction =
        lastTutorActivityAt > 0 && lastTutorActivityAt >= lastCommandAt;
      const hasWeakProgress =
        currentStatus === "attempted" || currentStatus === "off_track";
      const idleThreshold =
        activeStep?.step_type === "browser"
          ? IDLE_BROWSER_THRESHOLD_MS
          : recentlyGuidedWithoutAction
          ? IDLE_AFTER_GUIDANCE_THRESHOLD_MS
          : hasWeakProgress
          ? IDLE_STRUGGLE_THRESHOLD_MS
          : IDLE_BASE_THRESHOLD_MS;
      const observerState = idleObserverRef.current;
      const lastNudgeAt = observerState.lastNudgeAt || 0;
      const lastNudgeForStep =
        observerState.lastNudgedStepId === stepKey ? lastNudgeAt : 0;
      const lastTutorMode = lastTutorMessage?.tutorMode || "";
      const lastInterventionLabel = lastTutorMessage?.interventionLabel || "";

      if (currentStatus === "completed") {
        return;
      }

      if (latestActivityAt === 0 || now - latestActivityAt < idleThreshold) {
        return;
      }

      if (
        lastTutorActivityAt > 0 &&
        now - lastTutorActivityAt < RECENT_TUTOR_COOLDOWN_MS
      ) {
        return;
      }

      if (
        ["strong_hint", "near_complete_guidance"].includes(lastTutorMode) &&
        lastTutorActivityAt > 0 &&
        now - lastTutorActivityAt < RECENT_STRONG_GUIDANCE_COOLDOWN_MS
      ) {
        return;
      }

      if (
        lastInterventionLabel === "Idle nudge" &&
        lastTutorActivityAt > 0 &&
        now - lastTutorActivityAt < IDLE_REPEAT_THRESHOLD_MS
      ) {
        return;
      }

      if (lastNudgeForStep && now - lastNudgeForStep < IDLE_REPEAT_THRESHOLD_MS) {
        return;
      }

      sendTutorRequest({
        intent: "idle_nudge",
        label: "Tutor check-in",
        recordQuestion: false,
        pendingSource: "idle_observer",
      })
        .then(() => {
          idleObserverRef.current = {
            lastNudgeAt: now,
            lastNudgedStepId: stepKey,
            nudgeCountByStep: {
              ...idleObserverRef.current.nudgeCountByStep,
              [stepKey]:
                (idleObserverRef.current.nudgeCountByStep?.[stepKey] || 0) + 1,
            },
          };
        })
        .catch(() => {
          // Tutor connection state is surfaced through the shared action error.
        });
    }, IDLE_CHECK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    activeStep,
    environmentReady,
    lastStudentMessage,
    lastTutorMessage,
    sendTutorRequest,
    sessionCompleted,
    sessionRecord?.environment_launched_at,
    summary.currentLabStepIndex,
    tutorBusy,
    workflow.currentTaskStatus,
    workflow.lastCommandAt,
    workflow.lastFeedbackAt,
  ]);

  return (
    <div className="page-stack">
      <section className="workspace-step-strip">
        <div className="workspace-step-brief__header">
          <div>
            <span className="eyebrow">
              {stepCounterLabel} {workflow.labCompleted ? "" : "- Current step"}
            </span>
            <h2>{workflow.currentTaskLabel}</h2>
          </div>
        </div>

        <div className="workspace-step-brief__summary">
          <div className="workspace-step-brief__item">
            <span className="detail-label">Objective</span>
            <p>{stepObjective}</p>
          </div>
          <div className="workspace-step-brief__item">
            <span className="detail-label">Do</span>
            <p>{stepDoNow}</p>
          </div>
          <div className="workspace-step-brief__signal">
            <span className="detail-label">Watch</span>
            <p>{primaryObservationCue || stepExpectedOutcome || "The evidence this step asks for."}</p>
          </div>
        </div>

        {hasExpandedStepDetails ? (
          <details className="workspace-step-brief__details">
            <summary>More step details</summary>
            <div className="content-stack">
              {activeStep?.instruction && activeStep.instruction !== stepDoNow ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Full instruction</span>
                  <p>{activeStep.instruction}</p>
                </div>
              ) : null}
              {stepExplanation ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Explanation</span>
                  <p>{stepExplanation}</p>
                </div>
              ) : null}
              {stepExpectedOutcome ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Expected outcome</span>
                  <p>{stepExpectedOutcome}</p>
                </div>
              ) : null}
              {stepObservationFocus.length ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">What to observe</span>
                  <div className="workspace-step-brief__hints">
                    {stepObservationFocus.map((item, index) => (
                      <p key={`${item}-${index}`}>{item}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {stepWhyObservationMatters ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Why it matters</span>
                  <p>{stepWhyObservationMatters}</p>
                </div>
              ) : null}
              {stepHints.length ? (
                <div className="detail-box detail-box--tertiary">
                  <span className="detail-label">Hints</span>
                  <div className="workspace-step-brief__hints">
                    {stepHints.map((hint, index) => (
                      <p key={`${hint}-${index}`}>{hint}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </section>

      <div className="workspace-live-grid">
        <section className="workspace-panel workspace-panel--terminal">
          <div className="workspace-panel__minimal-heading">
            <div>
              <span className="eyebrow">Do the work here</span>
              <h2>Terminal</h2>
            </div>
            {!environmentReady ? (
              <button
                type="button"
                className="button button--primary"
                onClick={handleLaunch}
                disabled={!sessionId || launchingLab || sessionCompleted}
              >
                {launchingLab ? "Launching..." : "Launch Environment"}
              </button>
            ) : null}
          </div>

          {environmentReady ? (
            <LiveTerminal
              ref={liveTerminalRef}
              key={`${sessionId}-${terminalSessionKey}`}
              sessionId={sessionId}
              containerLabel="lab-workspace"
              onFeedback={handleTerminalFeedback}
              onTutorPendingChange={handleTutorPendingChange}
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
                    ? "The lab environment was cleaned up when the session ended. Review the guide or reports, or start a new session to relaunch a live environment."
                    : "Launch the environment, then use the terminal for the current lab step."}
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
                    to={buildSessionPath(
                      sessionId,
                      sessionCompleted ? "reports" : "overview"
                    )}
                  >
                    {sessionCompleted ? "Open Reports" : "Back to Overview"}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="workspace-panel workspace-panel--tutor">
          <div className="workspace-panel__minimal-heading">
            <div>
              <span className="eyebrow">Tutor</span>
              <h2>Here with you</h2>
            </div>
          </div>

          <div ref={tutorThreadRef} className="tutor-chat__thread">
            {tutorConversation.length ? (
              <>
                {tutorConversation.map((message) => (
                  <TutorChatMessage key={message.id} message={message} />
                ))}
                {tutorPending.active ? (
                  <div className="tutor-chat__pending">
                    <span className="tutor-chat__avatar" aria-hidden="true">
                      T
                    </span>
                    <div className="tutor-chat__pending-copy">
                      <span className="tutor-chat__speaker">Tutor</span>
                      <p>{getTutorPendingCopy(tutorPending.source)}</p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="tutor-chat__empty">
                  <span className="tutor-chat__avatar" aria-hidden="true">
                    T
                  </span>
                  <div className="tutor-chat__empty-copy">
                    <strong>I'm here with you on this step.</strong>
                    <p>Ask anything or paste what you are seeing.</p>
                  </div>
                </div>
                {tutorPending.active ? (
                  <div className="tutor-chat__pending">
                    <span className="tutor-chat__avatar" aria-hidden="true">
                      T
                    </span>
                    <div className="tutor-chat__pending-copy">
                      <span className="tutor-chat__speaker">Tutor</span>
                      <p>{getTutorPendingCopy(tutorPending.source)}</p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <form className="tutor-chat__composer" onSubmit={handleTutorSubmit}>
            <textarea
              id="tutor-chat-input"
              className="field tutor-chat__input"
              rows={3}
              value={tutorDraft}
              onChange={(event) => setTutorDraft(event.target.value)}
              onKeyDown={handleTutorDraftKeyDown}
              placeholder={getTutorPlaceholder()}
              disabled={!environmentReady || sessionCompleted || tutorBusy}
            />

            <div className="tutor-chat__composer-actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={
                  !environmentReady ||
                  sessionCompleted ||
                  tutorBusy ||
                  !tutorDraft.trim()
                }
              >
                {sendingTutorRequest ? "Sending..." : "Send"}
              </button>
            </div>
          </form>

          <div className="tutor-chat__quick-actions" aria-label="Quick tutor prompts">
            {tutorAskOptions.map((option) => (
              <button
                key={option.intent}
                type="button"
                className="button button--ghost tutor-actions__button"
                onClick={() => handleAskTutor(option.intent)}
                disabled={!environmentReady || sessionCompleted || tutorBusy}
              >
                {option.shortLabel}
              </button>
            ))}
          </div>

          {tutorActionError ? (
            <div className="callout callout--warning">
              <strong>Tutor unavailable:</strong> {tutorActionError}
            </div>
          ) : null}
        </section>
      </div>

      <details
        className="workspace-support-panel"
        open={supportPanelOpen}
        onToggle={(event) => setSupportPanelOpen(event.currentTarget.open)}
      >
        <summary className="workspace-support-panel__summary">
          <div>
            <span className="eyebrow">Secondary</span>
            <h2>Support and Results</h2>
          </div>
          <span
            className={badgeClass(
              findingSuggestion || latestStepTakeaway || labDebrief
                ? "info"
                : "muted"
            )}
          >
            {findingSuggestion
              ? "Finding ready"
              : latestStepTakeaway || labDebrief
              ? "Learning recap available"
              : "Hidden by default"}
          </span>
        </summary>

        <div className="workspace-support-panel__body content-stack">
          {latestStepTakeaway ? (
            <div className="workspace-learning-card workspace-learning-card--secondary">
              <span className="detail-label">What the last step proved</span>
              <h3>
                Step {latestStepTakeaway.stepNumber}: {latestStepTakeaway.title}
              </h3>
              <p>{latestStepTakeaway.summary}</p>
              {latestStepTakeaway.whyItMattered ? (
                <p>
                  <strong>Why it mattered:</strong> {latestStepTakeaway.whyItMattered}
                </p>
              ) : null}
              <p>
                <strong>Evidence used:</strong> {latestStepTakeaway.evidenceSummary}
              </p>
              {latestStepTakeaway.nextConnection ? (
                <p>
                  <strong>How it connects:</strong> {latestStepTakeaway.nextConnection}
                </p>
              ) : null}
            </div>
          ) : null}

          {labDebrief ? (
            <div className="workspace-learning-card workspace-learning-card--secondary">
              <span className="detail-label">End-of-lab debrief</span>
              <h3>{labDebrief.title}</h3>
              <p>{labDebrief.summary}</p>
              {labDebrief.takeawayList?.length ? (
                <div className="workspace-learning-card__group">
                  <span className="detail-label">Main takeaways</span>
                  <div className="workspace-learning-card__list">
                    {labDebrief.takeawayList.map((takeaway, index) => (
                      <p key={`${takeaway}-${index}`}>{takeaway}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {labDebrief.toolsUsed?.length ? (
                <div className="workspace-learning-card__group">
                  <span className="detail-label">Tools used</span>
                  <div className="inline-actions">
                    {labDebrief.toolsUsed.map((tool) => (
                      <span key={tool} className={badgeClass("sky")}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {labDebrief.highlightedFindings?.length ? (
                <div className="workspace-learning-card__group">
                  <span className="detail-label">Key observations</span>
                  <div className="workspace-learning-card__list">
                    {labDebrief.highlightedFindings.map((finding, index) => (
                      <p key={`${finding}-${index}`}>{finding}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              <p>
                <strong>Reflection:</strong> {labDebrief.reflectionPrompt}
              </p>
            </div>
          ) : null}

          {terminalFeedback ? (
            <div className="detail-box detail-box--tertiary">
              <div className="section-heading">
                <div>
                  <span className="detail-label">Latest command review</span>
                  <h3>{assessment.label}</h3>
                </div>
                <div className="inline-actions">
                  <span className={badgeClass(assessment.tone)}>
                    {terminalFeedback.assessment || "neutral"}
                  </span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={clearFeedback}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p>{terminalFeedback.explanation || "No explanation available."}</p>
              {terminalFeedback.next_step ? (
                <p>
                  <strong>Next move:</strong> {terminalFeedback.next_step}
                </p>
              ) : null}
            </div>
          ) : null}

          {findingSuggestion ? (
            <div className="detail-box detail-box--tertiary">
              <div className="section-heading">
                <div>
                  <span className="detail-label">Suggested finding</span>
                  <h3>{findingSuggestion.title || "Untitled finding"}</h3>
                </div>
                <span
                  className={badgeClass(
                    getFindingSeverityTone(findingSuggestion.severity)
                  )}
                >
                  {findingSuggestion.severity || "Medium"}
                </span>
              </div>
              <p>
                {findingSuggestion.description || "No description available."}
              </p>
              {findingSuggestion.evidence ? (
                <pre className="terminal-evidence">{findingSuggestion.evidence}</pre>
              ) : null}
              <div className="inline-actions">
                <button
                  type="button"
                  className="button button--secondary"
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
          ) : null}

          <div className="inline-actions">
            <Link
              className="button button--ghost"
              to={buildSessionPath(sessionId, "guide")}
            >
              Review Guide
            </Link>
            <Link
              className="button button--secondary"
              to={buildSessionPath(sessionId, "reports")}
            >
              Open Reports
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
