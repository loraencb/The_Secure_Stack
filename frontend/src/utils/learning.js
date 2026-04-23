function normalizeText(value = "") {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(value = "", limit = 220) {
  const text = normalizeText(value);
  if (!text || text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trimEnd()}...`;
}

function extractCommandTool(command = "") {
  const trimmed = normalizeText(command);
  if (!trimmed) {
    return "";
  }

  return trimmed.split(/\s+/)[0]?.toLowerCase() || "";
}

function formatEvidenceSummary(step, progress) {
  const command = normalizeText(progress?.evidence_command);
  if (command) {
    return command;
  }

  const notes = normalizeText(progress?.evidence_notes);
  if (notes) {
    return truncateText(notes, 180);
  }

  const expectedEvidence = Array.isArray(step?.expected_evidence)
    ? step.expected_evidence.filter(Boolean)
    : [];
  if (expectedEvidence.length) {
    return expectedEvidence.join(", ");
  }

  return "Evidence saved for this step.";
}

function buildDefaultTakeaway(step) {
  const expectedOutcome = normalizeText(step?.expected_outcome);
  if (expectedOutcome) {
    return `This step proved ${expectedOutcome.charAt(0).toLowerCase()}${expectedOutcome.slice(
      1
    )}`;
  }

  const objective = normalizeText(step?.objective || step?.instruction);
  if (objective) {
    return `This step advanced the lab by helping you ${objective.charAt(0).toLowerCase()}${objective.slice(
      1
    )}`;
  }

  return "This step added useful evidence to the lab investigation.";
}

export function buildStepTakeaway({
  step,
  progress,
  stepNumber = step?.step_number || 0,
  totalSteps = 0,
  nextStep = null,
}) {
  if (!step || !progress) {
    return null;
  }

  const authoredTakeaway = normalizeText(step.learning_takeaway);
  const explanation = normalizeText(
    step.why_observation_matters || step.explanation || step.objective
  );
  const nextStepTitle = normalizeText(nextStep?.title);

  return {
    taskId: step.task_id || "",
    stepNumber,
    totalSteps,
    title: normalizeText(step.title) || `Step ${stepNumber}`,
    summary: authoredTakeaway || buildDefaultTakeaway(step),
    whyItMattered: explanation,
    evidenceSummary: formatEvidenceSummary(step, progress),
    nextConnection: nextStepTitle
      ? `This sets you up for Step ${stepNumber + 1}: ${nextStepTitle}.`
      : "This closes the practical validation path for the current lab.",
  };
}

export function buildCompletedStepTakeaways({
  completedTaskRecords = [],
  totalSteps = 0,
  labSteps = [],
}) {
  return completedTaskRecords
    .map(({ step, progress }, index) => {
      const resolvedStepNumber = step?.step_number || index + 1;
      return buildStepTakeaway({
        step,
        progress,
        stepNumber: resolvedStepNumber,
        totalSteps,
        nextStep: labSteps[resolvedStepNumber] || null,
      });
    })
    .filter(Boolean);
}

export function buildLabDebrief({
  labDefinition,
  labSteps = [],
  completedTaskRecords = [],
  findings = [],
  commandsRunCount = 0,
}) {
  if (!labDefinition || !labSteps.length) {
    return null;
  }

  const completedCount = completedTaskRecords.length;
  const labTakeaways = Array.isArray(labDefinition.lab_takeaways)
    ? labDefinition.lab_takeaways
        .map((item) => normalizeText(item))
        .filter(Boolean)
    : [];
  const completedStepTakeaways = buildCompletedStepTakeaways({
    completedTaskRecords,
    totalSteps: labSteps.length,
    labSteps,
  });
  const toolsUsed = Array.from(
    new Set(
      completedTaskRecords
        .map(({ progress }) => extractCommandTool(progress?.evidence_command))
        .filter(Boolean)
    )
  );
  const fallbackTools = Array.isArray(labDefinition.required_tools)
    ? labDefinition.required_tools.filter(
        (tool) => typeof tool === "string" && tool.trim() && tool !== "bash"
      )
    : [];
  const takeawayList = (
    labTakeaways.length
      ? labTakeaways
      : completedStepTakeaways.map((item) => item.summary)
  )
    .filter(Boolean)
    .slice(0, 4);
  const highlightedFindings = findings
    .slice(0, 2)
    .map((finding) => normalizeText(finding?.title))
    .filter(Boolean);
  const summary =
    takeawayList[0] ||
    normalizeText(labDefinition.description) ||
    "This lab moved from guided validation into evidence-backed understanding.";

  return {
    title: `${labDefinition.name || "Lab"} debrief`,
    summary,
    takeawayList,
    toolsUsed: (toolsUsed.length ? toolsUsed : fallbackTools).slice(0, 4),
    highlightedFindings,
    completedStepsLabel: `${completedCount}/${labSteps.length} steps completed`,
    commandsLabel:
      commandsRunCount > 0 ? `${commandsRunCount} commands captured` : "",
    reflectionPrompt:
      normalizeText(labDefinition.reflection_prompt) ||
      completedStepTakeaways[completedStepTakeaways.length - 1]?.nextConnection ||
      "Review which observation changed your understanding of the target the most.",
  };
}
