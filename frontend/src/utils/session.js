const SESSION_STORAGE_KEY = "securestack_active_session_id";
const LAB_STORAGE_KEY = "securestack_active_lab_id";

export const taskStatusMeta = {
  completed: { label: "Completed", tone: "success" },
  attempted: { label: "Needs Evidence", tone: "warning" },
  off_track: { label: "Off Track", tone: "danger" },
  current: { label: "Current", tone: "info" },
  pending: { label: "Pending", tone: "muted" },
};

export const aiStatusMeta = {
  successful: { label: "Successful", tone: "success" },
  insufficient: { label: "Insufficient", tone: "warning" },
  off_track: { label: "Off Track", tone: "danger" },
  manual_confirmation: { label: "Manual", tone: "sky" },
};

export const evidenceQualityMeta = {
  strong: { label: "Strong Evidence", tone: "success" },
  partial: { label: "Partial Evidence", tone: "warning" },
  weak: { label: "Weak Evidence", tone: "danger" },
  none: { label: "No Evidence", tone: "muted" },
};

export const assessmentMeta = {
  useful: { label: "Useful", tone: "success" },
  neutral: { label: "Neutral", tone: "info" },
  risky: { label: "Risky", tone: "warning" },
  incorrect: { label: "Incorrect", tone: "danger" },
};

export const severityMeta = {
  High: { label: "High", tone: "danger" },
  Medium: { label: "Medium", tone: "warning" },
  Low: { label: "Low", tone: "success" },
};

export const riskMeta = {
  High: { label: "High", tone: "danger" },
  Medium: { label: "Medium", tone: "warning" },
  Low: { label: "Low", tone: "success" },
};

export function mergeFindings(existingFindings, incomingFindings) {
  const merged = [...existingFindings];

  for (const finding of incomingFindings) {
    if (!finding) {
      continue;
    }

    const exists = merged.some((item) => {
      if (item.id && finding.id) {
        return item.id === finding.id;
      }

      return (
        item.session_id === finding.session_id &&
        item.title === finding.title &&
        item.severity === finding.severity &&
        item.description === finding.description
      );
    });

    if (!exists) {
      merged.push(finding);
    }
  }

  return merged;
}

export function mergeLabSteps(definitionTasks = [], runtimeSteps = []) {
  if (!runtimeSteps.length) {
    return definitionTasks;
  }

  return runtimeSteps.map((step, index) => ({
    ...(definitionTasks[index] || {}),
    ...step,
  }));
}

function extractTargetPort(browserUrl) {
  if (!browserUrl || typeof browserUrl !== "string") {
    return "";
  }

  const segments = browserUrl.split(":");
  return segments.length > 2 ? segments[segments.length - 1].replace(/\/$/, "") : "";
}

function resolveRuntimeStepText(value, browserUrl) {
  if (typeof value !== "string" || !value.includes("{target_port}")) {
    return value;
  }

  const targetPort = extractTargetPort(browserUrl);
  if (!targetPort) {
    return value;
  }

  return value.replaceAll("{target_port}", targetPort);
}

export function hydrateRuntimeLabSteps(steps = [], runtimeInfo = null) {
  const browserUrl = runtimeInfo?.browser_url;
  if (!browserUrl) {
    return steps;
  }

  return steps.map((step) => ({
    ...step,
    instruction: resolveRuntimeStepText(step.instruction, browserUrl),
    expected_outcome: resolveRuntimeStepText(step.expected_outcome, browserUrl),
    command_hint: resolveRuntimeStepText(step.command_hint, browserUrl),
    hint_text: resolveRuntimeStepText(step.hint_text, browserUrl),
    remediation_text: resolveRuntimeStepText(step.remediation_text, browserUrl),
    hints: Array.isArray(step.hints)
      ? step.hints.map((hint) => resolveRuntimeStepText(hint, browserUrl))
      : step.hints,
  }));
}

export function buildTaskProgressMap(records = []) {
  return records.reduce((accumulator, record) => {
    if (record?.task_id) {
      accumulator[record.task_id] = record;
    }

    return accumulator;
  }, {});
}

export function getStoredSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const parsed = Number(stored);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setStoredSessionId(sessionId) {
  if (typeof window === "undefined") {
    return;
  }

  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, String(sessionId));
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getStoredLabId(defaultLabId) {
  if (typeof window === "undefined") {
    return defaultLabId;
  }

  return window.localStorage.getItem(LAB_STORAGE_KEY) || defaultLabId;
}

export function setStoredLabId(labId) {
  if (typeof window === "undefined") {
    return;
  }

  if (labId) {
    window.localStorage.setItem(LAB_STORAGE_KEY, labId);
    return;
  }

  window.localStorage.removeItem(LAB_STORAGE_KEY);
}

export function clearStoredSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LAB_STORAGE_KEY);
}

export function getCompletedStepIndexes(steps = [], taskProgress = {}) {
  return steps.reduce((completed, step, index) => {
    if (taskProgress[step.task_id]?.status === "completed") {
      completed.push(index);
    }

    return completed;
  }, []);
}

export function getCurrentLabStepIndex(steps = [], taskProgress = {}) {
  if (!steps.length) {
    return 0;
  }

  const nextPendingIndex = steps.findIndex(
    (step) => taskProgress[step.task_id]?.status !== "completed"
  );

  return nextPendingIndex === -1 ? steps.length : nextPendingIndex;
}

export function getEvidencePreview(progressRecord) {
  if (!progressRecord) {
    return "No saved evidence.";
  }

  if (progressRecord.evidence_command) {
    return progressRecord.evidence_command;
  }

  if (progressRecord.evidence_notes) {
    return progressRecord.evidence_notes;
  }

  return "Evidence saved without a command.";
}

export function getRecommendedNextAction(activeStep, activeTaskProgress) {
  if (!activeStep) {
    return "Review findings and generate the session report.";
  }

  if (activeStep.step_type === "browser") {
    return activeStep.manual_confirmation_label || activeStep.instruction;
  }

  if (activeTaskProgress?.status === "off_track") {
    return (
      activeStep.remediation_text ||
      activeStep.command_hint ||
      activeStep.instruction
    );
  }

  if (activeTaskProgress?.status === "attempted") {
    return (
      activeStep.remediation_text ||
      activeStep.command_hint ||
      activeStep.instruction
    );
  }

  return activeStep.command_hint || activeStep.instruction;
}

export function sortFindings(findings = []) {
  return [...findings].sort((a, b) => {
    const firstCreatedAt = Date.parse(a?.created_at || "") || 0;
    const secondCreatedAt = Date.parse(b?.created_at || "") || 0;

    if (secondCreatedAt !== firstCreatedAt) {
      return secondCreatedAt - firstCreatedAt;
    }

    return (b.id || 0) - (a.id || 0);
  });
}

export function getSessionSummary({
  labSteps = [],
  taskProgress = {},
  findings = [],
}) {
  const completedSteps = getCompletedStepIndexes(labSteps, taskProgress);
  const currentLabStepIndex = getCurrentLabStepIndex(labSteps, taskProgress);
  const activeLabStep =
    labSteps && currentLabStepIndex < labSteps.length
      ? labSteps[currentLabStepIndex]
      : null;
  const activeTaskProgress = activeLabStep
    ? taskProgress[activeLabStep.task_id] || null
    : null;
  const totalSteps = labSteps.length;
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps.length / totalSteps) * 100) : 0;
  const taskProgressRecords = Object.values(taskProgress);
  const insufficientTasksCount = taskProgressRecords.filter(
    (task) => task.status === "attempted"
  ).length;
  const offTrackAttemptsCount = taskProgressRecords.filter(
    (task) => task.status === "off_track"
  ).length;
  const completedTaskRecords = labSteps
    .map((step) => ({
      step,
      progress: taskProgress[step.task_id],
    }))
    .filter(({ progress }) => progress?.status === "completed");
  const compactEvidenceSummary = completedTaskRecords.slice(0, 3);
  const sortedFindings = sortFindings(findings);
  const mostRecentFinding = sortedFindings[0] || null;

  return {
    completedSteps,
    currentLabStepIndex,
    activeLabStep,
    activeTaskProgress,
    totalSteps,
    progressPercent,
    insufficientTasksCount,
    offTrackAttemptsCount,
    completedTaskRecords,
    compactEvidenceSummary,
    sortedFindings,
    mostRecentFinding,
    recommendedNextAction: getRecommendedNextAction(
      activeLabStep,
      activeTaskProgress
    ),
  };
}
