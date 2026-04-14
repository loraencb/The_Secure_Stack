const SECTION_EVENT_META = {
  guide: {
    label: "Reviewed the lab guide",
    detail:
      "Opened the guided walkthrough to align the next investigation step with the lab objective.",
    tone: "info",
    category: "Guide",
    order: 20,
  },
  workspace: {
    label: "Entered the live workspace",
    detail:
      "Moved into the terminal workspace to validate commands and gather evidence.",
    tone: "sky",
    category: "Workspace",
    order: 25,
  },
  reports: {
    label: "Opened findings and report review",
    detail:
      "Shifted into the reporting flow to review evidence, findings, and the report summary.",
    tone: "info",
    category: "Reports",
    order: 75,
  },
};

const TASK_STATUS_META = {
  completed: {
    prefix: "Validated",
    tone: "success",
    category: "Step",
  },
  attempted: {
    prefix: "Captured partial evidence for",
    tone: "warning",
    category: "Step",
  },
  off_track: {
    prefix: "Revisited after an off-track attempt",
    tone: "danger",
    category: "Step",
  },
};

const FINDING_SOURCE_META = {
  manual: {
    prefix: "Saved finding",
    tone: "success",
    category: "Finding",
  },
  ai_suggestion: {
    prefix: "Accepted AI finding suggestion",
    tone: "sky",
    category: "Finding",
  },
  ai_auto_saved: {
    prefix: "AI auto-saved finding",
    tone: "info",
    category: "Finding",
  },
};

function getValidTimestamp(timestamp) {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) && parsed > 0 ? timestamp : "";
}

function formatTimelineTimestamp(timestamp) {
  const safeTimestamp = getValidTimestamp(timestamp);
  if (!safeTimestamp) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(safeTimestamp));
}

function createTimelineEntry({
  key,
  label,
  detail,
  tone = "muted",
  category = "Session",
  timestamp = "",
  order = 0,
}) {
  const safeTimestamp = getValidTimestamp(timestamp);

  return {
    key,
    label,
    detail,
    tone,
    category,
    timestamp: safeTimestamp,
    timestampLabel: formatTimelineTimestamp(safeTimestamp),
    order,
  };
}

function getStepMap(labSteps = []) {
  return new Map(
    labSteps.map((step, index) => [
      step.task_id,
      {
        ...step,
        number: index + 1,
      },
    ])
  );
}

function getSectionEntries(workflowState = {}, visitedSections = []) {
  const sectionHistory =
    Array.isArray(workflowState.sectionHistory) && workflowState.sectionHistory.length
      ? workflowState.sectionHistory
      : visitedSections.map((section, index) => ({
          section,
          visitedAt: "",
          index,
        }));

  return sectionHistory
    .map((entry, index) => {
      const meta = SECTION_EVENT_META[entry.section];
      if (!meta) {
        return null;
      }

      return createTimelineEntry({
        key: `section-${entry.section}-${index}`,
        label: meta.label,
        detail: meta.detail,
        tone: meta.tone,
        category: meta.category,
        timestamp: entry.visitedAt,
        order: meta.order + index,
      });
    })
    .filter(Boolean);
}

function getTaskEntries(taskProgress = {}, labSteps = []) {
  const stepMap = getStepMap(labSteps);

  return Object.values(taskProgress)
    .filter((record) => TASK_STATUS_META[record?.status])
    .sort((first, second) => {
      const firstTimestamp = Date.parse(first?.completed_at || "") || 0;
      const secondTimestamp = Date.parse(second?.completed_at || "") || 0;

      if (firstTimestamp !== secondTimestamp) {
        return firstTimestamp - secondTimestamp;
      }

      return (first?.id || 0) - (second?.id || 0);
    })
    .map((record, index) => {
      const step = stepMap.get(record.task_id);
      const stepLabel = step
        ? `Step ${step.number}: ${step.title}`
        : record.task_id || "lab step";
      const meta = TASK_STATUS_META[record.status];
      const detail =
        record.evidence_command ||
        record.ai_feedback ||
        record.evidence_notes ||
        "Progress was saved for this task.";

      return createTimelineEntry({
        key: `task-${record.task_id}-${record.id || index}`,
        label: `${meta.prefix} ${stepLabel}`,
        detail,
        tone: meta.tone,
        category: meta.category,
        timestamp: record.completed_at,
        order: 40 + index,
      });
    });
}

function getFindingEntries(workflowState = {}, findings = []) {
  const persistedFindingEntries = findings
    .filter(
      (finding) =>
        getValidTimestamp(finding?.created_at) ||
        typeof finding?.title === "string"
    )
    .map((finding, index) => {
      const meta =
        FINDING_SOURCE_META[finding.source] || FINDING_SOURCE_META.manual;
      const detail = finding.task_label
        ? `${finding.title} linked to ${finding.task_label}`
        : finding.severity
        ? `${finding.title} (${finding.severity} severity)`
        : finding.title;

      return createTimelineEntry({
        key: `finding-persisted-${finding.id || index}`,
        label: `${meta.prefix}: ${finding.title || "Untitled finding"}`,
        detail,
        tone: meta.tone,
        category: meta.category,
        timestamp: finding.created_at,
        order: 80 + index,
      });
    });

  if (persistedFindingEntries.length) {
    return persistedFindingEntries;
  }

  const findingHistory = Array.isArray(workflowState.findingHistory)
    ? workflowState.findingHistory
    : [];

  if (!findingHistory.length) {
    return findings.length
      ? [
          createTimelineEntry({
            key: "findings-derived",
            label: "Saved findings available for review",
            detail:
              "The session has saved findings, but the precise save times were not captured in this browser run.",
            tone: "success",
            category: "Finding",
            order: 80,
          }),
        ]
      : [];
  }

  return findingHistory.map((entry, index) => {
    const meta = FINDING_SOURCE_META[entry.source] || FINDING_SOURCE_META.manual;
    const title = entry.title || "Untitled finding";
    const detail = entry.severity
      ? `${title} (${entry.severity} severity)`
      : title;

    return createTimelineEntry({
      key: `finding-${entry.createdAt || index}-${title}`,
      label: `${meta.prefix}: ${title}`,
      detail,
      tone: meta.tone,
      category: meta.category,
      timestamp: entry.createdAt,
      order: 80 + index,
    });
  });
}

export function getSessionTimeline({
  sessionId,
  workflow,
  workflowState = {},
  sessionRecord = null,
  labInfo,
  report,
  findings = [],
  taskProgress = {},
  labSteps = [],
}) {
  if (!sessionId) {
    return {
      entries: [],
      entryCount: 0,
      latestEntry: null,
    };
  }

  const entries = [
    createTimelineEntry({
      key: `session-${sessionId}`,
      label: "Session started",
      detail: `Session #${sessionId} opened the investigation workflow.`,
      tone: "success",
      category: "Session",
      timestamp: sessionRecord?.start_time || workflowState.sessionStartedAt,
      order: 10,
    }),
    ...getSectionEntries(workflowState, workflow.visitedSections),
  ];

  if (
    labInfo ||
    sessionRecord?.environment_launched_at ||
    workflowState.environmentLaunchedAt
  ) {
    entries.push(
      createTimelineEntry({
        key: `environment-${sessionId}`,
        label: "Environment launched",
        detail: (labInfo?.attacker_container || sessionRecord?.attacker_container)
          ? `Connected to ${
              labInfo?.attacker_container || sessionRecord?.attacker_container
            } and prepared the live lab runtime.`
          : "The lab environment was launched for live investigation.",
        tone: "sky",
        category: "Environment",
        timestamp:
          sessionRecord?.environment_launched_at ||
          workflowState.environmentLaunchedAt,
        order: 30,
      })
    );
  }

  entries.push(...getTaskEntries(taskProgress, labSteps));

  if (workflow.evidenceContext?.hasEvidence) {
    entries.push(
      createTimelineEntry({
        key: `evidence-${workflow.evidenceContext.recentCommand || sessionId}`,
        label: workflow.evidenceContext.taskContext
          ? `Captured evidence for ${workflow.evidenceContext.taskContext}`
          : "Captured session evidence",
        detail:
          workflow.evidenceContext.recentCommand ||
          workflow.evidenceContext.readiness.detail,
        tone: workflow.evidenceContext.readiness.tone,
        category: "Evidence",
        timestamp: workflow.evidenceContext.latestEvidenceAt,
        order: 70,
      })
    );
  }

  entries.push(...getFindingEntries(workflowState, findings));

  if (report || sessionRecord?.report_generated_at || workflowState.reportGeneratedAt) {
    entries.push(
      createTimelineEntry({
        key: `report-${sessionId}`,
        label: "Generated final report",
        detail:
          "Turned the saved findings and evidence trail into a final session summary.",
        tone: "success",
        category: "Report",
        timestamp:
          sessionRecord?.report_generated_at || workflowState.reportGeneratedAt,
        order: 90,
      })
    );
  }

  if (workflow.activeTask && !workflow.reportGenerated) {
    entries.push(
      createTimelineEntry({
        key: `current-focus-${workflow.activeTask.task_id}`,
        label: `Current focus: ${workflow.currentTaskLabel}`,
        detail:
          workflow.currentTaskObjective ||
          "This is the active task the learner is currently working through.",
        tone: "info",
        category: "Current",
        order: 95,
      })
    );
  }

  const uniqueEntries = entries.filter(
    (entry, index, allEntries) =>
      allEntries.findIndex((candidate) => candidate.key === entry.key) === index
  );

  const orderedEntries = uniqueEntries.sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order;
    }

    if (first.timestamp && second.timestamp) {
      return Date.parse(first.timestamp) - Date.parse(second.timestamp);
    }

    if (first.timestamp && !second.timestamp) {
      return -1;
    }

    if (!first.timestamp && second.timestamp) {
      return 1;
    }

    return first.label.localeCompare(second.label);
  });

  return {
    entries: orderedEntries,
    entryCount: orderedEntries.length,
    latestEntry: orderedEntries[orderedEntries.length - 1] || null,
  };
}
