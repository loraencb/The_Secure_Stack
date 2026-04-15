import {
  getEvidenceContext,
  getFindingEvidenceStats,
} from "./findings";
import { getSessionTimeline } from "./timeline";

const WORKFLOW_STORAGE_KEY_PREFIX = "securestack_session_workflow_";

const DEFAULT_WORKFLOW_STATE = {
  visitedSections: [],
  sectionHistory: [],
  commandsRunCount: 0,
  lastCommand: "",
  lastCommandAt: "",
  lastFeedbackAt: "",
  sessionStartedAt: "",
  environmentLaunchedAt: "",
  findingHistory: [],
  reportGeneratedAt: "",
};

function getWorkflowStorageKey(sessionId) {
  return `${WORKFLOW_STORAGE_KEY_PREFIX}${sessionId}`;
}

function normalizeVisitedSections(visitedSections = []) {
  return Array.from(
    new Set(
      visitedSections.filter(
        (section) => typeof section === "string" && section.trim()
      )
    )
  );
}

function normalizeWorkflowState(workflowState = {}) {
  const commandsRunCount = Number(workflowState.commandsRunCount);
  const sectionHistory = Array.isArray(workflowState.sectionHistory)
    ? workflowState.sectionHistory
        .filter(
          (entry) =>
            typeof entry?.section === "string" && entry.section.trim()
        )
        .map((entry) => ({
          section: entry.section.trim(),
          visitedAt:
            typeof entry?.visitedAt === "string" ? entry.visitedAt : "",
        }))
    : [];
  const seenSections = new Set();
  const normalizedSectionHistory = sectionHistory.filter((entry) => {
    if (seenSections.has(entry.section)) {
      return false;
    }

    seenSections.add(entry.section);
    return true;
  });
  const findingHistory = Array.isArray(workflowState.findingHistory)
    ? workflowState.findingHistory
        .filter(
          (entry) => typeof entry?.title === "string" && entry.title.trim()
        )
        .map((entry) => ({
          title: entry.title.trim(),
          severity:
            typeof entry?.severity === "string" ? entry.severity : "Medium",
          source: typeof entry?.source === "string" ? entry.source : "manual",
          createdAt:
            typeof entry?.createdAt === "string" ? entry.createdAt : "",
        }))
        .slice(-12)
    : [];
  const normalizedVisitedSections = normalizeVisitedSections(
    Array.isArray(workflowState.visitedSections) &&
      workflowState.visitedSections.length
      ? workflowState.visitedSections
      : normalizedSectionHistory.map((entry) => entry.section)
  );

  return {
    visitedSections: normalizedVisitedSections,
    sectionHistory: normalizedSectionHistory,
    commandsRunCount:
      Number.isFinite(commandsRunCount) && commandsRunCount > 0
        ? Math.round(commandsRunCount)
        : 0,
    lastCommand:
      typeof workflowState.lastCommand === "string"
        ? workflowState.lastCommand.trim()
        : "",
    lastCommandAt:
      typeof workflowState.lastCommandAt === "string"
        ? workflowState.lastCommandAt
        : "",
    lastFeedbackAt:
      typeof workflowState.lastFeedbackAt === "string"
        ? workflowState.lastFeedbackAt
        : "",
    sessionStartedAt:
      typeof workflowState.sessionStartedAt === "string"
        ? workflowState.sessionStartedAt
        : "",
    environmentLaunchedAt:
      typeof workflowState.environmentLaunchedAt === "string"
        ? workflowState.environmentLaunchedAt
        : "",
    findingHistory,
    reportGeneratedAt:
      typeof workflowState.reportGeneratedAt === "string"
        ? workflowState.reportGeneratedAt
        : "",
  };
}

function formatPluralizedCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getPersistedCommandInsights(taskProgress = {}) {
  const commandRecords = Object.values(taskProgress)
    .filter(
      (record) =>
        typeof record?.evidence_command === "string" &&
        record.evidence_command.trim()
    )
    .sort((first, second) => {
      const secondCompletedAt = Date.parse(second?.completed_at || "") || 0;
      const firstCompletedAt = Date.parse(first?.completed_at || "") || 0;

      if (secondCompletedAt !== firstCompletedAt) {
        return secondCompletedAt - firstCompletedAt;
      }

      return (second?.id || 0) - (first?.id || 0);
    });

  const latestCommandRecord = commandRecords[0] || null;

  return {
    persistedCommandCount: commandRecords.length,
    persistedLastCommand: latestCommandRecord?.evidence_command?.trim() || "",
    persistedLastCommandAt: latestCommandRecord?.completed_at || "",
  };
}

function getWorkflowStatus({
  sessionId,
  sessionCompleted,
  environmentLaunched,
  hasCommandActivity,
  hasFindings,
  reportGenerated,
  activeTask,
  reportReadinessKey,
}) {
  if (!sessionId) {
    return {
      label: "Ready to start",
      tone: "muted",
      detail: "Start a session to open the guided lab workflow.",
    };
  }

  if (reportGenerated) {
    return {
      label: "Report ready",
      tone: "success",
      detail:
        "The workflow has reached the reporting stage and the session summary is available.",
    };
  }

  if (sessionCompleted) {
    return {
      label: "Session completed",
      tone: "muted",
      detail:
        "The lab environment has been cleaned up. Review saved evidence, reopen reports, or start a fresh session when you are ready.",
    };
  }

  if (!environmentLaunched) {
    return {
      label: "Waiting for launch",
      tone: "sky",
      detail:
        "The session is active, but the attacker and target environment still needs to be launched.",
    };
  }

  if (hasFindings) {
    if (reportReadinessKey === "needs_evidence_context") {
      return {
        label: "Evidence needs review",
        tone: "warning",
        detail:
          "Findings exist, but they still need clearer task and command context before the report feels complete.",
      };
    }

    return {
      label: "Evidence saved",
      tone: "success",
      detail:
        "The strongest evidence has been captured, so the session is ready for reporting.",
    };
  }

  if (hasCommandActivity) {
    return {
      label: "Evidence in progress",
      tone: "warning",
      detail:
        "Commands have been run for the active task, but the evidence still needs to be saved as a finding.",
    };
  }

  if (activeTask) {
    return {
      label: "Validating active step",
      tone: "info",
      detail: `The environment is live and step ${activeTask.number} is ready to validate.`,
    };
  }

  return {
    label: "Session active",
    tone: "info",
    detail: "The session is active and ready for the next guided action.",
  };
}

function getReportReadiness({
  hasCommandActivity,
  hasFindings,
  reportGenerated,
  evidenceAwareFindingsCount,
  findingsCount,
}) {
  if (reportGenerated) {
    return {
      key: "generated",
      label: "Report generated",
      tone: "success",
      detail: "The session report is ready to review.",
    };
  }

  if (hasFindings) {
    if (!evidenceAwareFindingsCount) {
      return {
        key: "needs_evidence_context",
        label: "Needs evidence context",
        tone: "warning",
        detail: `You have ${formatPluralizedCount(findingsCount, "finding")} saved, but none of them includes clear task and command evidence yet. Capture one evidence-backed finding before generating the report.`,
      };
    }

    return {
      key: "ready",
      label: "Ready for report",
      tone: "success",
      detail: `You have ${formatPluralizedCount(evidenceAwareFindingsCount, "evidence-backed finding")} ready for the report summary.`,
    };
  }

  if (hasCommandActivity) {
    return {
      key: "needs_finding_capture",
      label: "Needs saved evidence",
      tone: "warning",
      detail:
        "Command activity exists, but at least one finding should be saved before the report feels complete.",
    };
  }

  return {
    key: "not_ready",
    label: "Too early for report",
    tone: "muted",
    detail:
      "Run the guide steps in the workspace and capture evidence before generating the report.",
  };
}

function getNextRecommendation({
  sessionId,
  workflowState,
  sessionCompleted,
  environmentLaunched,
  hasCommandActivity,
  hasFindings,
  reportGenerated,
  activeTask,
  activeTaskProgress,
  findings,
  reportReadiness,
}) {
  if (!sessionId) {
    return {
      key: "start_session",
      label: "Start Session",
      targetSection: "overview",
      tone: "info",
      description:
        "Start a session to unlock the lab guide, workspace, and reporting flow.",
      reason: "No active session exists yet.",
    };
  }

  if (sessionCompleted) {
    if (reportGenerated) {
      return {
        key: "review_report",
        label: "Review Report",
        targetSection: "reports",
        tone: "success",
        description:
          "This session has been completed and the environment was cleaned up. Review the final report and saved evidence.",
        reason: "Completed sessions stay available for review even after the lab runtime is removed.",
      };
    }

    if (hasFindings) {
      if (reportReadiness?.key === "needs_evidence_context") {
        return {
          key: "review_evidence",
          label: "Review Evidence",
          targetSection: "reports",
          tone: "warning",
          description:
            "This session is complete, but the saved findings still need clearer evidence context before the report feels finished.",
          reason:
            "The runtime is gone, so this session is now best used as a review and reporting space.",
        };
      }

      return {
        key: "generate_report",
        label: "Generate Report",
        targetSection: "reports",
        tone: "success",
        description:
          "The environment has been cleaned up, but your saved findings are still available. Generate the report to finalize the investigation.",
        reason: "Completed sessions can still be synthesized into a durable report.",
      };
    }

    return {
      key: "start_session",
      label: "Start Session",
      targetSection: "overview",
      tone: "muted",
      description:
        "This session has already been ended and the environment was cleaned up. Start a fresh session when you are ready to launch a new lab.",
      reason:
        "Completed sessions stay available for review, but they do not reopen a live environment.",
    };
  }

  if (!environmentLaunched) {
    return {
      key: "launch_environment",
      label: "Launch Environment",
      targetSection: "workspace",
      tone: "sky",
      description: activeTask
        ? `Open the workspace and launch the environment so you can validate step ${activeTask.number}: ${activeTask.title}.`
        : "Open the workspace and launch the lab environment to begin validating the lab.",
      reason: "The lab cannot be validated until the attacker and target containers are live.",
    };
  }

  if (activeTaskProgress?.status === "off_track") {
    return {
      key: "review_guide",
      label: "Review Guide",
      targetSection: "guide",
      tone: "danger",
      description:
        activeTask?.remediation_text ||
        activeTask?.command_hint ||
        activeTask?.instruction ||
        "Review the guide to realign with the active task.",
      reason: "The latest command attempt was off track for the active lab step.",
    };
  }

  if (activeTaskProgress?.status === "attempted") {
    return {
      key: "strengthen_evidence",
      label: "Review Guide",
      targetSection: "guide",
      tone: "warning",
      description:
        activeTask?.remediation_text ||
        activeTask?.command_hint ||
        activeTask?.instruction ||
        "Review the guide to strengthen the evidence for the current task.",
      reason: "The active task needs stronger evidence before it can be completed.",
    };
  }

  if (activeTask && !workflowState.visitedSections.includes("guide")) {
    return {
      key: "open_guide",
      label: "Review Guide",
      targetSection: "guide",
      tone: "info",
      description: `Review step ${activeTask.number}: ${activeTask.title} so you know what evidence to capture next.`,
      reason: "The current task is active, but the guide has not been reviewed in this session yet.",
    };
  }

  if (
    activeTask &&
    activeTask.step_type === "command" &&
    !hasCommandActivity
  ) {
    return {
      key: "validate_step",
      label: "Open Workspace",
      targetSection: "workspace",
      tone: "sky",
      description:
        activeTask.command_hint
          ? `Run ${activeTask.command_hint} in the workspace to validate step ${activeTask.number}.`
          : `Open the workspace and validate step ${activeTask.number}: ${activeTask.title}.`,
      reason: "The environment is ready, but no command activity has been captured yet.",
    };
  }

  if (
    activeTask &&
    activeTask.step_type === "browser" &&
    activeTaskProgress?.status !== "completed"
  ) {
    return {
      key: "complete_browser_step",
      label: "Open Workspace",
      targetSection: "workspace",
      tone: "info",
      description: `Use the workspace runtime details to complete the browser validation for step ${activeTask.number}: ${activeTask.title}.`,
      reason: "The active task requires confirming the browser experience from the running environment.",
    };
  }

  if (hasCommandActivity && !hasFindings) {
    return {
      key: "capture_finding",
      label: "Capture Finding",
      targetSection: "reports",
      tone: "warning",
      description:
        "You have command activity, but no saved findings yet. Open Reports and capture the strongest evidence while it is fresh.",
      reason: "Evidence has been produced, but it has not been preserved as a finding.",
    };
  }

  if (hasFindings && !reportGenerated) {
    if (reportReadiness?.key === "needs_evidence_context") {
      return {
        key: "review_evidence",
        label: "Review Evidence",
        targetSection: "reports",
        tone: "warning",
        description:
          "Saved findings exist, but they still need stronger task and command context before the report will feel complete.",
        reason:
          "The reporting pipeline has findings, but they are not yet grounded in clear evidence context.",
      };
    }

    return {
      key: "generate_report",
      label: "Generate Report",
      targetSection: "reports",
      tone: "success",
      description: `You have ${formatPluralizedCount(findings.length, "finding")} saved. Generate the report to summarize the session.`,
      reason: "Enough evidence exists to create a session summary.",
    };
  }

  if (reportGenerated) {
    return {
      key: "review_report",
      label: "Review Report",
      targetSection: "reports",
      tone: "success",
      description:
        "The report is ready. Review the saved findings, summary, and recommendations before wrapping up the lab.",
      reason: "The workflow has reached its final reporting stage.",
    };
  }

  return {
    key: "keep_validating",
    label: "Open Workspace",
    targetSection: "workspace",
    tone: "info",
    description: activeTask
      ? `Continue validating step ${activeTask.number}: ${activeTask.title} in the workspace.`
      : "Continue working through the live workspace and capture evidence as you go.",
    reason: "The workflow is ready for more validation activity.",
  };
}

function buildWorkflowMilestones({
  sessionId,
  workflowState,
  sessionCompleted,
  environmentLaunched,
  hasFindings,
  reportGenerated,
}) {
  const guideReviewed = workflowState.visitedSections.includes("guide");
  const hasCommandActivity = workflowState.commandsRunCount > 0;
  const environmentMilestoneComplete =
    environmentLaunched ||
    (sessionCompleted && (hasCommandActivity || hasFindings || reportGenerated));

  return [
    {
      key: "session",
      label: "Session created",
      complete: Boolean(sessionId),
      detail: sessionId
        ? `Session #${sessionId} is active.`
        : "Start a session to begin the lab.",
    },
    {
      key: "guide",
      label: "Guide reviewed",
      complete: guideReviewed,
      detail: guideReviewed
        ? "The guide has been reviewed in this session."
        : "Open the guide to align with the active task.",
    },
    {
      key: "environment",
      label: "Environment launched",
      complete: environmentMilestoneComplete,
      detail: environmentLaunched
        ? "The attacker and target environment is live."
        : sessionCompleted
        ? "The environment was launched during the session and has since been cleaned up."
        : "Launch the environment from the workspace.",
    },
    {
      key: "commands",
      label: "Command activity",
      complete: hasCommandActivity,
      detail: hasCommandActivity
        ? `${formatPluralizedCount(workflowState.commandsRunCount, "command")} captured in this session.`
        : "Run commands in the workspace to validate the active task.",
    },
    {
      key: "findings",
      label: "Evidence saved",
      complete: hasFindings,
      detail: hasFindings
        ? "At least one finding has been saved."
        : "Capture the strongest evidence as a saved finding.",
    },
    {
      key: "report",
      label: "Report generated",
      complete: reportGenerated,
      detail: reportGenerated
        ? "The session report is ready."
        : "Generate the report when the evidence is ready.",
    },
  ];
}

export function getDefaultWorkflowState() {
  return {
    ...DEFAULT_WORKFLOW_STATE,
    visitedSections: [],
    sectionHistory: [],
    findingHistory: [],
  };
}

export function getStoredWorkflowState(sessionId) {
  if (typeof window === "undefined" || !sessionId) {
    return getDefaultWorkflowState();
  }

  const raw = window.localStorage.getItem(getWorkflowStorageKey(sessionId));
  if (!raw) {
    return getDefaultWorkflowState();
  }

  try {
    return normalizeWorkflowState(JSON.parse(raw));
  } catch {
    return getDefaultWorkflowState();
  }
}

export function setStoredWorkflowState(sessionId, workflowState) {
  if (typeof window === "undefined" || !sessionId) {
    return;
  }

  const normalizedState = normalizeWorkflowState(workflowState);
  window.localStorage.setItem(
    getWorkflowStorageKey(sessionId),
    JSON.stringify(normalizedState)
  );
}

export function clearStoredWorkflowState() {
  if (typeof window === "undefined") {
    return;
  }

  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith(WORKFLOW_STORAGE_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  });
}

export function getSectionNavigationLabel(sectionSlug) {
  if (sectionSlug === "guide") {
    return "Open Guide";
  }

  if (sectionSlug === "workspace") {
    return "Open Workspace";
  }

  if (sectionSlug === "reports") {
    return "Open Reports";
  }

  return "Open Overview";
}

export function getSessionWorkflow({
  sessionId,
  sessionRecord = null,
  summary,
  labSteps = [],
  labInfo,
  report,
  findings = [],
  taskProgress = {},
  workflowState = getDefaultWorkflowState(),
}) {
  const normalizedState = normalizeWorkflowState(workflowState);
  const {
    persistedCommandCount,
    persistedLastCommand,
    persistedLastCommandAt,
  } = getPersistedCommandInsights(taskProgress);
  const environmentLaunched = Boolean(
    labInfo ||
      sessionRecord?.environment_launched_at ||
      normalizedState.environmentLaunchedAt
  );
  const sessionCompleted = Boolean(
    sessionRecord?.status === "completed" || sessionRecord?.end_time
  );
  const hasFindings = findings.length > 0;
  const reportGenerated = Boolean(
    report || sessionRecord?.report_generated_at || normalizedState.reportGeneratedAt
  );
  const commandsRunCount = Math.max(
    normalizedState.commandsRunCount,
    persistedCommandCount
  );
  const hasCommandActivity = commandsRunCount > 0;
  const activeTask = summary.activeLabStep
    ? {
        ...summary.activeLabStep,
        number: summary.currentLabStepIndex + 1,
      }
    : null;
  const baseWorkflowContext = {
    activeTask,
    currentTaskLabel: activeTask
      ? `Step ${activeTask.number}: ${activeTask.title}`
      : "All guided lab steps completed",
    currentTaskObjective:
      activeTask?.objective || activeTask?.instruction || "",
    currentTaskStatus:
      summary.activeTaskProgress?.status || (activeTask ? "pending" : "completed"),
    lastCommand: normalizedState.lastCommand || persistedLastCommand,
    commandsRunCount,
  };
  const findingEvidenceStats = getFindingEvidenceStats(findings);
  const reportReadiness = getReportReadiness({
    hasCommandActivity,
    hasFindings,
    reportGenerated,
    evidenceAwareFindingsCount: findingEvidenceStats.evidenceAwareCount,
    findingsCount: findings.length,
  });
  const nextRecommendation = getNextRecommendation({
    sessionId,
    workflowState: normalizedState,
    sessionCompleted,
    environmentLaunched,
    hasCommandActivity,
    hasFindings,
    reportGenerated,
    activeTask,
    activeTaskProgress: summary.activeTaskProgress,
    findings,
    reportReadiness,
  });
  const evidenceContext = getEvidenceContext({
    workflow: {
      ...baseWorkflowContext,
      nextRecommendation,
    },
    taskProgress,
    labSteps,
  });
  const milestones = buildWorkflowMilestones({
    sessionId,
    workflowState: {
      ...normalizedState,
      commandsRunCount,
    },
    sessionCompleted,
    environmentLaunched,
    hasFindings,
    reportGenerated,
  });
  const completedMilestones = milestones.filter(
    (milestone) => milestone.complete
  ).length;
  const workflowPercent =
    milestones.length > 0
      ? Math.round((completedMilestones / milestones.length) * 100)
      : 0;
  const status = getWorkflowStatus({
    sessionId,
    sessionCompleted,
    environmentLaunched,
    hasCommandActivity,
    hasFindings,
    reportGenerated,
    activeTask,
    reportReadinessKey: reportReadiness.key,
  });

  const workflowModel = {
    visitedSections: normalizedState.visitedSections,
    visitedSectionCount: normalizedState.visitedSections.length,
    commandsRunCount,
    hasCommandActivity,
    lastCommand: normalizedState.lastCommand || persistedLastCommand,
    lastCommandAt:
      normalizedState.lastCommandAt || persistedLastCommandAt,
    lastFeedbackAt: normalizedState.lastFeedbackAt,
    sessionCompleted,
    environmentLaunched,
    hasFindings,
    findingsCount: findings.length,
    findingEvidenceStats,
    evidenceContext,
    reportGenerated,
    reportReadiness,
    activeTask,
    currentTaskNumber: activeTask?.number || 0,
    currentTaskLabel: activeTask
      ? `Step ${activeTask.number}: ${activeTask.title}`
      : "All guided lab steps completed",
    currentTaskObjective:
      activeTask?.objective || activeTask?.instruction || "",
    currentTaskStatus:
      summary.activeTaskProgress?.status || (activeTask ? "pending" : "completed"),
    completedStepCount: summary.completedSteps.length,
    workflowPercent,
    milestones,
    completedMilestones,
    status,
    nextRecommendation,
    readyForReport: reportReadiness.key === "ready",
    needsEvidenceContext: reportReadiness.key === "needs_evidence_context",
    canCaptureEvidence:
      hasCommandActivity &&
      (!hasFindings || reportReadiness.key === "needs_evidence_context"),
  };

  return {
    ...workflowModel,
    timeline: getSessionTimeline({
      sessionId,
      workflow: workflowModel,
      workflowState: normalizedState,
      sessionRecord,
      labInfo,
      report,
      findings,
      taskProgress,
      labSteps,
    }),
  };
}
