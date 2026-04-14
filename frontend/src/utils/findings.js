const FINDING_SECTION_LABELS = [
  "Task Context",
  "Task Objective",
  "Recent Command",
  "Evidence",
  "Impact",
  "Recommendation",
];

const FINDING_SECTION_KEYS = {
  "Task Context": "taskContext",
  "Task Objective": "taskObjective",
  "Recent Command": "recentCommand",
  Evidence: "evidence",
  Impact: "impact",
  Recommendation: "recommendation",
};

const FINDING_SECTION_PATTERN = new RegExp(
  `(?:^|\\n)(${FINDING_SECTION_LABELS.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("|")}):\\s*`,
  "g"
);

const DEFAULT_FINDING_CONTENT = {
  summary: "",
  taskContext: "",
  taskObjective: "",
  recentCommand: "",
  evidence: "",
  impact: "",
  recommendation: "",
  source: "",
  createdAt: "",
};

function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortEvidenceRecords(taskProgress = {}) {
  return Object.values(taskProgress)
    .filter(
      (record) =>
        trimValue(record?.evidence_command) ||
        trimValue(record?.evidence_output) ||
        trimValue(record?.evidence_notes) ||
        trimValue(record?.ai_feedback)
    )
    .sort((first, second) => {
      const secondCompletedAt = Date.parse(second?.completed_at || "") || 0;
      const firstCompletedAt = Date.parse(first?.completed_at || "") || 0;

      if (secondCompletedAt !== firstCompletedAt) {
        return secondCompletedAt - firstCompletedAt;
      }

      return (second?.id || 0) - (first?.id || 0);
    });
}

export function clipEvidenceText(value, maxLength = 420) {
  const normalizedValue = trimValue(value).replace(/\r/g, "");
  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength).trimEnd()}\n... [truncated]`;
}

export function parseFindingDescription(description = "") {
  const content = trimValue(description);
  const matches = [];
  let match;
  FINDING_SECTION_PATTERN.lastIndex = 0;

  while ((match = FINDING_SECTION_PATTERN.exec(content)) !== null) {
    matches.push({
      key: FINDING_SECTION_KEYS[match[1]],
      markerIndex: match.index + (match[0].startsWith("\n") ? 1 : 0),
      contentStart: FINDING_SECTION_PATTERN.lastIndex,
    });
  }

  if (!matches.length) {
    return {
      ...DEFAULT_FINDING_CONTENT,
      summary: content,
    };
  }

  const findingContent = {
    ...DEFAULT_FINDING_CONTENT,
    summary: content.slice(0, matches[0].markerIndex).trim(),
  };

  matches.forEach((section, index) => {
    const nextSection = matches[index + 1];
    findingContent[section.key] = content
      .slice(section.contentStart, nextSection?.markerIndex ?? content.length)
      .trim();
  });

  return findingContent;
}

export function buildFindingContent(finding = {}) {
  const parsedContent = parseFindingDescription(finding?.description || "");

  return {
    ...parsedContent,
    taskContext: trimValue(finding?.task_label) || parsedContent.taskContext,
    taskObjective:
      trimValue(finding?.task_objective) || parsedContent.taskObjective,
    recentCommand:
      trimValue(finding?.evidence_command) || parsedContent.recentCommand,
    evidence:
      clipEvidenceText(finding?.evidence_snapshot) || parsedContent.evidence,
    source: trimValue(finding?.source),
    createdAt: trimValue(finding?.created_at),
  };
}

export function buildFindingDescription(content = {}) {
  const sections = [
    trimValue(content.summary),
    trimValue(content.taskContext)
      ? `Task Context:\n${trimValue(content.taskContext)}`
      : "",
    trimValue(content.taskObjective)
      ? `Task Objective:\n${trimValue(content.taskObjective)}`
      : "",
    trimValue(content.recentCommand)
      ? `Recent Command:\n${trimValue(content.recentCommand)}`
      : "",
    trimValue(content.evidence)
      ? `Evidence:\n${trimValue(content.evidence)}`
      : "",
    trimValue(content.impact) ? `Impact:\n${trimValue(content.impact)}` : "",
    trimValue(content.recommendation)
      ? `Recommendation:\n${trimValue(content.recommendation)}`
      : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function mergeFindingEvidenceContext(description, evidenceContext = {}) {
  const parsedDescription = parseFindingDescription(description);

  return buildFindingDescription({
    summary: parsedDescription.summary || trimValue(description),
    taskContext: parsedDescription.taskContext || evidenceContext.taskContext,
    taskObjective:
      parsedDescription.taskObjective || evidenceContext.taskObjective,
    recentCommand:
      parsedDescription.recentCommand || evidenceContext.recentCommand,
    evidence: parsedDescription.evidence || evidenceContext.evidence,
    impact: parsedDescription.impact,
    recommendation:
      parsedDescription.recommendation || evidenceContext.recommendation,
  });
}

export function getFindingEvidenceStats(findings = []) {
  const parsedFindings = findings.map((finding) => buildFindingContent(finding));

  const evidenceBackedCount = parsedFindings.filter(
    (finding) => finding.evidence || finding.recentCommand
  ).length;
  const taskLinkedCount = parsedFindings.filter(
    (finding) => finding.taskContext || finding.taskObjective
  ).length;
  const evidenceAwareCount = parsedFindings.filter(
    (finding) =>
      (finding.taskContext || finding.taskObjective) &&
      (finding.evidence || finding.recentCommand)
  ).length;

  return {
    evidenceBackedCount,
    taskLinkedCount,
    evidenceAwareCount,
  };
}

export function getEvidenceContext({
  workflow,
  taskProgress = {},
  labSteps = [],
}) {
  const taskMap = new Map(
    labSteps.map((step, index) => [
      step.task_id,
      {
        ...step,
        number: index + 1,
      },
    ])
  );
  const latestEvidenceRecord = sortEvidenceRecords(taskProgress)[0] || null;
  const latestEvidenceTask = latestEvidenceRecord
    ? taskMap.get(latestEvidenceRecord.task_id)
    : null;
  const contextTask = latestEvidenceTask || workflow.activeTask || null;
  const fallbackTaskContext =
    workflow.currentTaskLabel === "All guided lab steps completed"
      ? ""
      : workflow.currentTaskLabel;
  const taskContext = contextTask
    ? `Step ${contextTask.number}: ${contextTask.title}`
    : fallbackTaskContext;
  const taskObjective =
    trimValue(contextTask?.objective) ||
    trimValue(contextTask?.instruction) ||
    trimValue(workflow.currentTaskObjective);
  const recentCommand =
    trimValue(latestEvidenceRecord?.evidence_command) ||
    trimValue(workflow.lastCommand);
  const evidence = clipEvidenceText(
    latestEvidenceRecord?.evidence_output || latestEvidenceRecord?.evidence_notes
  );
  const recommendation = trimValue(workflow.nextRecommendation?.description);
  const hasTaskContext = Boolean(taskContext);
  const hasEvidence = Boolean(recentCommand || evidence);

  let readiness = {
    key: "weak",
    label: "Weak evidence context",
    tone: "muted",
    detail:
      "No recent task evidence has been captured yet. Run a command in the workspace before saving a finding.",
  };

  if (recentCommand && !evidence) {
    readiness = {
      key: "building",
      label: "Building evidence context",
      tone: "warning",
      detail:
        "A recent command is available, but the strongest output is still worth reviewing before saving the finding.",
    };
  } else if (hasEvidence && hasTaskContext) {
    readiness = {
      key: "ready",
      label: "Evidence draft ready",
      tone: "success",
      detail:
        "Recent task activity includes enough context to pre-structure a stronger finding draft.",
    };
  } else if (hasEvidence) {
    readiness = {
      key: "partial",
      label: "Partial evidence context",
      tone: "info",
      detail:
        "Recent evidence is available, but the task context still needs a little more review before the report feels complete.",
    };
  }

  const draftTitle = contextTask
    ? `Evidence draft for ${taskContext}`
    : recentCommand
    ? `Evidence draft from ${recentCommand}`
    : "Finding draft";

  const draftDescription = buildFindingDescription({
    summary: contextTask
      ? `Review the evidence captured while working on ${taskContext} and replace this line with the validated finding summary.`
      : "Review the recent session evidence and replace this line with the validated finding summary.",
    taskContext,
    taskObjective,
    recentCommand,
    evidence,
    recommendation,
  });

  return {
    taskContext,
    taskObjective,
    recentCommand,
    evidence,
    latestEvidenceAt:
      latestEvidenceRecord?.completed_at || trimValue(workflow.lastCommandAt),
    recommendation,
    commandCount: workflow.commandsRunCount,
    hasTaskContext,
    hasEvidence,
    readiness,
    draftTitle,
    draftDescription,
    latestTaskStatus: latestEvidenceRecord?.status || workflow.currentTaskStatus,
  };
}
