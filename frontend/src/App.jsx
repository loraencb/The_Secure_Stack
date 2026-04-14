export { default } from "./AppRouter.jsx";
/*
import { useEffect, useState, useCallback } from "react";
import {
  startSession,
  launchLab,
  getLabDefinition,
  getTaskProgress,
  completeTaskProgress,
  addFinding,
  getFindings,
  getReport,
} from "./api/Client";
import LiveTerminal from "./components/LiveTerminal";

const LAB_ID = "juice-shop-recon";
const SESSION_LAB_NAME = "juice-shop";
const SESSION_STORAGE_KEY = "securestack_active_session_id";

function mergeFindings(existingFindings, incomingFindings) {
  const merged = [...existingFindings];

  for (const finding of incomingFindings) {
    if (!finding) continue;

    const exists = merged.some((item) => {
      if (item.id && finding.id) return item.id === finding.id;

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

function mergeLabSteps(definitionTasks = [], runtimeSteps = []) {
  if (!runtimeSteps.length) return definitionTasks;

  return runtimeSteps.map((step, index) => ({
    ...(definitionTasks[index] || {}),
    ...step,
  }));
}

function getStoredSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  const parsed = Number(stored);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildTaskProgressMap(records = []) {
  return records.reduce((accumulator, record) => {
    if (record?.task_id) {
      accumulator[record.task_id] = record;
    }
    return accumulator;
  }, {});
}

function getCompletedStepIndexes(steps = [], taskProgress = {}) {
  return steps.reduce((completed, step, index) => {
    if (taskProgress[step.task_id]?.status === "completed") {
      completed.push(index);
    }

    return completed;
  }, []);
}

function getCurrentLabStepIndex(steps = [], taskProgress = {}) {
  if (!steps.length) return 0;

  const nextPendingIndex = steps.findIndex(
    (step) => taskProgress[step.task_id]?.status !== "completed"
  );

  return nextPendingIndex === -1 ? steps.length : nextPendingIndex;
}

function getEvidencePreview(progressRecord) {
  if (!progressRecord) return "No saved evidence.";

  if (progressRecord.evidence_command) {
    return progressRecord.evidence_command;
  }

  if (progressRecord.evidence_notes) {
    return progressRecord.evidence_notes;
  }

  return "Evidence saved without a command.";
}

function getRecommendedNextAction(activeStep, activeTaskProgress) {
  if (!activeStep) {
    return "Review findings and generate the session report.";
  }

  if (activeStep.step_type === "browser") {
    return activeStep.manual_confirmation_label || activeStep.instruction;
  }

  if (activeTaskProgress?.status === "off_track") {
    return activeStep.remediation_text || activeStep.command_hint || activeStep.instruction;
  }

  if (activeTaskProgress?.status === "attempted") {
    return activeStep.remediation_text || activeStep.command_hint || activeStep.instruction;
  }

  return activeStep.command_hint || activeStep.instruction;
}

export default function App() {
  const [labDefinition, setLabDefinition] = useState(null);
  const [sessionId, setSessionId] = useState(() => getStoredSessionId());
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [terminalFeedback, setTerminalFeedback] = useState(null);
  const [findingSuggestion, setFindingSuggestion] = useState(null);
  const [findings, setFindings] = useState([]);
  const [labInfo, setLabInfo] = useState(null);
  const [startingSession, setStartingSession] = useState(false);
  const [savingFinding, setSavingFinding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);
  const [labSteps, setLabSteps] = useState(null);
  const [launchingLab, setLaunchingLab] = useState(false);
  const [taskProgress, setTaskProgress] = useState({});
  const [findingForm, setFindingForm] = useState({
    title: "",
    severity: "Medium",
    description: "",
  });

  const loadLabDefinition = useCallback(async () => {
    const definition = await getLabDefinition(LAB_ID);
    setLabDefinition(definition);
    setLabSteps((prev) => mergeLabSteps(definition.tasks || [], prev || []));
    return definition;
  }, []);

  const syncTaskProgress = useCallback(async (activeSessionId) => {
    if (!activeSessionId) {
      setTaskProgress({});
      return {};
    }

    const records = await getTaskProgress(activeSessionId);
    const progressMap = buildTaskProgressMap(records);
    setTaskProgress(progressMap);
    return progressMap;
  }, []);

  const syncFindings = useCallback(async (activeSessionId) => {
    if (!activeSessionId) {
      setFindings([]);
      return [];
    }

    const records = await getFindings(activeSessionId);
    const sortedRecords = [...records].sort((a, b) => (b.id || 0) - (a.id || 0));
    setFindings(sortedRecords);
    return sortedRecords;
  }, []);

  useEffect(() => {
    loadLabDefinition().catch((error) => {
      console.error("Lab definition load error:", error);
    });
  }, [loadLabDefinition]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sessionId) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, String(sessionId));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setTaskProgress({});
      setFindings([]);
      return;
    }

    syncTaskProgress(sessionId).catch((error) => {
      console.error("Task progress sync error:", error);

      if (error.message === "Session not found") {
        setSessionId(null);
        setTaskProgress({});
        setMessage("Previous session could not be restored.");
      }
    });

    syncFindings(sessionId).catch((error) => {
      console.error("Findings sync error:", error);
    });
  }, [sessionId, syncFindings, syncTaskProgress]);

  const handleStartSession = async () => {
    setStartingSession(true);
    setMessage("");
    try {
      const definition =
        (await loadLabDefinition().catch((error) => {
          console.error("Lab definition refresh error:", error);
          return labDefinition;
        })) || labDefinition;

      const res = await startSession(SESSION_LAB_NAME);
      setSessionId(res.id);
      setTaskProgress({});
      setReport(null);
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setFindings([]);
      setLabInfo(null);
      setLabSteps(definition?.tasks || []);
      setReport(null);
      setMessage(`Session ${res.id} started successfully.`);
    } catch (error) {
      console.error("Start session error:", error);
      setMessage(error.message || "Failed to start session.");
    } finally {
      setStartingSession(false);
    }
  };

  const handleLaunchLab = async () => {
    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    setLaunchingLab(true);
    setMessage("");
    try {
      const definition = labDefinition || (await loadLabDefinition());
      const data = await launchLab(sessionId, LAB_ID);
      setLabSteps(mergeLabSteps(definition?.tasks || [], data.steps || []));
      setLabInfo(data);
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setMessage("Lab launched successfully.");
    } catch (error) {
      console.error("Lab launch error:", error);
      setMessage(error.message || "Failed to launch lab.");
    } finally {
      setLaunchingLab(false);
    }
  };
  
  const persistTaskCompletion = useCallback(
    async ({
      task,
      status = "completed",
      completionMethod,
      evidenceCommand = "",
      evidenceOutput = "",
      evidenceNotes = "",
      terminalFeedbackData = null,
      aiFeedback = "",
      aiStatus = "",
      aiConfidence = "",
      evidenceQuality = "",
    }) => {
      if (!sessionId || !task?.task_id) {
        return null;
      }

      const existingProgress = taskProgress[task.task_id];
      if (existingProgress?.status === "completed") {
        return existingProgress;
      }

      const savedProgress = await completeTaskProgress({
        session_id: sessionId,
        lab_id: labDefinition?.lab_id || LAB_ID,
        task_id: task.task_id,
        status,
        completion_method: completionMethod,
        evidence_command: evidenceCommand || null,
        evidence_output: evidenceOutput || null,
        evidence_notes: evidenceNotes || null,
        ai_status: aiStatus || null,
        ai_feedback: aiFeedback || null,
        ai_confidence: aiConfidence || null,
        evidence_quality: evidenceQuality || null,
        terminal_assessment: terminalFeedbackData?.assessment || null,
        terminal_explanation: terminalFeedbackData?.explanation || null,
        terminal_next_step: terminalFeedbackData?.next_step || null,
      });

      setTaskProgress((prev) => ({
        ...prev,
        [savedProgress.task_id]: savedProgress,
      }));

      return savedProgress;
    },
    [labDefinition, sessionId, taskProgress]
  );

  const handleAutoSavedFinding = useCallback((savedFinding) => {
    setFindings((prev) => mergeFindings(prev, [savedFinding]));

    setFindingSuggestion(null);
    setMessage(`AI auto-saved finding: ${savedFinding.title}`);
  }, []);

  const handleTerminalFeedback = useCallback((feedback) => {
    setTerminalFeedback(feedback);
  }, []);

  const handleFindingSuggestion = useCallback((suggestion) => {
    setFindingSuggestion(suggestion);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFindingForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddFinding = async (e) => {
    e.preventDefault();

    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    if (!findingForm.title.trim() || !findingForm.description.trim()) {
      setMessage("Please fill in all finding fields.");
      return;
    }

    setSavingFinding(true);
    setMessage("");

    try {
      const payload = {
        session_id: sessionId,
        title: findingForm.title.trim(),
        severity: findingForm.severity,
        description: findingForm.description.trim(),
      };

      const saved = await addFinding(payload);

      setFindings((prev) =>
        mergeFindings(prev, [
          saved?.id
            ? saved
            : {
                id: Date.now(),
                ...payload,
              },
        ])
      );

      setFindingForm({
        title: "",
        severity: "Medium",
        description: "",
      });

      setMessage("Finding added successfully.");
    } catch (error) {
      console.error("Add finding error:", error);
      setMessage("Failed to add finding.");
    } finally {
      setSavingFinding(false);
    }
  };

  const handleAcceptSuggestion = async () => {
    if (!sessionId || !findingSuggestion) {
      setMessage("No suggested finding available.");
      return;
    }

    setAcceptingSuggestion(true);
    setMessage("");

    try {
      const payload = {
        session_id: sessionId,
        title: findingSuggestion.title?.trim() || "Suggested Finding",
        severity: findingSuggestion.severity || "Medium",
        description: [
          findingSuggestion.description || "",
          findingSuggestion.evidence
            ? `Evidence:\n${findingSuggestion.evidence}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      };

      const saved = await addFinding(payload);

      setFindings((prev) =>
        mergeFindings(prev, [
          saved?.id
            ? saved
            : {
                id: Date.now(),
                ...payload,
              },
        ])
      );

      setFindingSuggestion(null);
      setMessage("Suggested finding accepted and saved.");
    } catch (error) {
      console.error("Accept suggested finding error:", error);
      setMessage("Failed to save suggested finding.");
    } finally {
      setAcceptingSuggestion(false);
    }
  };

  const handleDismissSuggestion = () => {
    setFindingSuggestion(null);
  };

  const handleGenerateReport = async () => {
    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    setGeneratingReport(true);
    setMessage("");

    try {
      const res = await getReport(sessionId);
      setReport(res);

      if (Array.isArray(res?.findings)) {
        setFindings((prev) => mergeFindings(prev, res.findings));
      }

      setMessage("Report generated successfully.");
    } catch (error) {
      console.error("Generate report error:", error);
      setMessage("Failed to generate report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const clearFeedback = () => {
    setTerminalFeedback(null);
  };

  const completedSteps = getCompletedStepIndexes(labSteps || [], taskProgress);
  const currentLabStep = getCurrentLabStepIndex(labSteps || [], taskProgress);
  const activeLabStep =
    labSteps && currentLabStep < labSteps.length ? labSteps[currentLabStep] : null;
  const activeTaskProgress = activeLabStep
    ? taskProgress[activeLabStep.task_id] || null
    : null;
  const totalSteps = labSteps?.length || 0;
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps.length / totalSteps) * 100) : 0;
  const taskProgressRecords = Object.values(taskProgress);
  const insufficientTasksCount = taskProgressRecords.filter(
    (task) => task.status === "attempted"
  ).length;
  const offTrackAttemptsCount = taskProgressRecords.filter(
    (task) => task.status === "off_track"
  ).length;
  const completedTaskRecords = (labSteps || [])
    .map((step) => ({
      step,
      progress: taskProgress[step.task_id],
    }))
    .filter(({ progress }) => progress?.status === "completed");
  const compactEvidenceSummary = completedTaskRecords.slice(0, 3);
  const sortedFindings = [...findings].sort((a, b) => (b.id || 0) - (a.id || 0));
  const mostRecentFinding = sortedFindings[0] || null;
  const currentRecommendedNextAction = getRecommendedNextAction(
    activeLabStep,
    activeTaskProgress
  );

  const handleCommandResult = useCallback(
    async ({ command, output, feedback }) => {
      if (!labSteps?.length || currentLabStep >= labSteps.length) {
        return;
      }

      const activeStep = labSteps[currentLabStep];
      if ((activeStep?.step_type || "command") !== "command") {
        return;
      }

      try {
        const savedProgress = await persistTaskCompletion({
          task: activeStep,
          completionMethod: "command_match",
          evidenceCommand: command,
          evidenceOutput: output?.trim(),
          evidenceNotes: "Captured from terminal command output.",
          terminalFeedbackData: feedback,
        });

        if (savedProgress?.status === "completed") {
          setMessage(`Step ${currentLabStep + 1} completed.`);
        } else if (savedProgress?.status === "off_track") {
          setMessage(`Step ${currentLabStep + 1} is still waiting for the expected command.`);
        } else {
          setMessage(`Step ${currentLabStep + 1} needs stronger evidence before it can be completed.`);
        }
      } catch (error) {
        console.error("Task completion persistence error:", error);
        setMessage(error.message || "Failed to save task progress.");
      }
    },
    [currentLabStep, labSteps, persistTaskCompletion]
  );

  const handleCompleteBrowserStep = async () => {
    if (!activeLabStep || activeLabStep.step_type !== "browser") {
      return;
    }

    try {
      await persistTaskCompletion({
        task: activeLabStep,
        status: "completed",
        completionMethod: "manual_confirmation",
        evidenceNotes: labInfo?.browser_url
          ? `Manually confirmed in browser at ${labInfo.browser_url}.`
          : "Manually confirmed in the browser.",
        aiFeedback: "This browser-only task was completed by manual confirmation.",
        aiStatus: "manual_confirmation",
        aiConfidence: "high",
        evidenceQuality: "strong",
      });
      setMessage(`Step ${currentLabStep + 1} completed.`);
    } catch (error) {
      console.error("Browser step persistence error:", error);
      setMessage(error.message || "Failed to save task progress.");
    }
  };

  const riskColor = {
    High: "#dc2626",
    Medium: "#d97706",
    Low: "#16a34a",
  };

  const assessmentColor = {
    useful: "#16a34a",
    neutral: "#2563eb",
    risky: "#d97706",
    incorrect: "#dc2626",
  };

  const taskStatusMeta = {
    completed: { label: "Completed", backgroundColor: "#dcfce7", color: "#166534" },
    attempted: { label: "Needs Evidence", backgroundColor: "#fef3c7", color: "#92400e" },
    off_track: { label: "Off Track", backgroundColor: "#fee2e2", color: "#991b1b" },
    current: { label: "Current", backgroundColor: "#dbeafe", color: "#1d4ed8" },
    pending: { label: "Pending", backgroundColor: "#e5e7eb", color: "#374151" },
  };

  const aiStatusMeta = {
    successful: { label: "Successful", backgroundColor: "#dcfce7", color: "#166534" },
    insufficient: { label: "Insufficient", backgroundColor: "#fef3c7", color: "#92400e" },
    off_track: { label: "Off Track", backgroundColor: "#fee2e2", color: "#991b1b" },
    manual_confirmation: {
      label: "Manual",
      backgroundColor: "#e0f2fe",
      color: "#075985",
    },
  };

  const evidenceQualityMeta = {
    strong: { label: "Strong Evidence", backgroundColor: "#dcfce7", color: "#166534" },
    partial: { label: "Partial Evidence", backgroundColor: "#fef3c7", color: "#92400e" },
    weak: { label: "Weak Evidence", backgroundColor: "#fee2e2", color: "#991b1b" },
    none: { label: "No Evidence", backgroundColor: "#e5e7eb", color: "#374151" },
  };

  const severityBadgeStyle = (severity) => ({
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#fff",
    backgroundColor:
      severity === "High"
        ? "#dc2626"
        : severity === "Medium"
        ? "#d97706"
        : "#16a34a",
  });

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Secure Stack</h1>
          <p style={styles.subtitle}>
            AI-assisted cybersecurity training dashboard
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            style={styles.primaryButton}
            onClick={handleStartSession}
            disabled={startingSession}
          >
            {startingSession ? "Starting..." : "Start Session"}
          </button>

          <button
            style={styles.secondaryButton}
            onClick={handleGenerateReport}
            disabled={!sessionId || generatingReport}
          >
            {generatingReport ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>

      {message && <div style={styles.banner}>{message}</div>}

      <div style={styles.grid}>
        <div style={styles.leftColumn}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Learner Summary</h2>
              <span style={styles.mutedText}>Current session progress</span>
            </div>

            <div style={styles.summaryHero}>
              <div>
                <span style={styles.label}>Lab Title</span>
                <p style={styles.summaryTitle}>
                  {labDefinition?.name ?? "Secure Stack Lab"}
                </p>
              </div>

              <div style={styles.summaryProgressCircle}>
                <span style={styles.summaryProgressValue}>{progressPercent}%</span>
                <span style={styles.summaryProgressLabel}>complete</span>
              </div>
            </div>

            <div style={styles.summaryGrid}>
              <div style={styles.summaryStat}>
                <span style={styles.metaLabel}>Total Tasks</span>
                <span style={styles.summaryStatValue}>{totalSteps}</span>
              </div>
              <div style={styles.summaryStat}>
                <span style={styles.metaLabel}>Completed</span>
                <span style={styles.summaryStatValue}>{completedSteps.length}</span>
              </div>
              <div style={styles.summaryStat}>
                <span style={styles.metaLabel}>Insufficient</span>
                <span style={styles.summaryStatValue}>{insufficientTasksCount}</span>
              </div>
              <div style={styles.summaryStat}>
                <span style={styles.metaLabel}>Off Track</span>
                <span style={styles.summaryStatValue}>{offTrackAttemptsCount}</span>
              </div>
            </div>

            <div style={styles.detailBlock}>
              <span style={styles.label}>Current Task</span>
              <p style={styles.paragraph}>
                {activeLabStep?.title || "All guided tasks completed"}
              </p>
            </div>

            <div style={styles.detailBlock}>
              <span style={styles.label}>Recommended Next Action</span>
              <p style={styles.paragraph}>{currentRecommendedNextAction}</p>
            </div>

            <div style={styles.detailBlock}>
              <span style={styles.label}>Completed Evidence Summary</span>
              {compactEvidenceSummary.length ? (
                <div style={styles.summaryList}>
                  {compactEvidenceSummary.map(({ step, progress }) => (
                    <div key={step.task_id} style={styles.summaryListItem}>
                      <strong style={styles.summaryListTitle}>{step.title}</strong>
                      <p style={styles.summaryListText}>
                        {getEvidencePreview(progress)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.paragraph}>
                  Completed-task evidence will appear here as the learner progresses.
                </p>
              )}
            </div>

            <div style={styles.detailBlock}>
              <span style={styles.label}>Findings Summary</span>
              <div style={styles.summaryGrid}>
                <div style={styles.summaryStat}>
                  <span style={styles.metaLabel}>Total Findings</span>
                  <span style={styles.summaryStatValue}>{findings.length}</span>
                </div>
                <div style={styles.summaryStat}>
                  <span style={styles.metaLabel}>Most Recent</span>
                  <span style={styles.summaryFindingValue}>
                    {mostRecentFinding?.title || "No findings yet"}
                  </span>
                  {mostRecentFinding ? (
                    <span style={styles.summaryFindingBadge}>
                      {mostRecentFinding.severity}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Session Status</h2>
              <span
                style={{
                  ...styles.statusBadge,
                  backgroundColor: sessionId ? "#dcfce7" : "#e5e7eb",
                  color: sessionId ? "#166534" : "#374151",
                }}
              >
                {sessionId ? "Active" : "Idle"}
              </span>
            </div>

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Lab</span>
                <span style={styles.metaValue}>
                  {labDefinition?.name ?? SESSION_LAB_NAME}
                </span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Session ID</span>
                <span style={styles.metaValue}>{sessionId ?? "None"}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Findings</span>
                <span style={styles.metaValue}>{findings.length}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>AI Feedback</span>
                <span style={styles.metaValue}>
                  {labInfo ? (terminalFeedback ? "Live" : "Ready") : "Waiting"}
                </span>
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>
                {labDefinition?.name ?? "Lab Module"}
              </h2>
              <span style={styles.mutedText}>
                {labDefinition?.difficulty ?? "Training"}{" "}
                {labDefinition?.category ? `· ${labDefinition.category}` : ""}
              </span>
            </div>

            {labDefinition ? (
              <div style={styles.feedbackStack}>
                <p style={styles.paragraph}>
                  {labDefinition.description || "No lab description available."}
                </p>

                {labDefinition.learning_objectives?.length ? (
                  <div>
                    <span style={styles.label}>Learning Objectives</span>
                    <ul style={styles.list}>
                      {labDefinition.learning_objectives.map((objective, index) => (
                        <li key={index}>{objective}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {labDefinition.prerequisites?.length ? (
                  <div>
                    <span style={styles.label}>Prerequisites</span>
                    <ul style={styles.list}>
                      {labDefinition.prerequisites.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {labDefinition.success_criteria?.length ? (
                  <div>
                    <span style={styles.label}>Success Criteria</span>
                    <ul style={styles.list}>
                      {labDefinition.success_criteria.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={styles.emptyState}>
                Loading lab module definition.
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Live Terminal</h2>
              <span style={styles.mutedText}>Linux container shell</span>
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
              <div style={styles.emptyState}>
                Launch the lab to open the terminal and begin the guided tasks.
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>AI Live Feedback</h2>
              <button style={styles.ghostButton} onClick={clearFeedback}>
                Clear
              </button>
            </div>

            {terminalFeedback ? (
              <div style={styles.feedbackStack}>
                <div>
                  <span style={styles.label}>Assessment</span>
                  <div
                    style={{
                      ...styles.valuePill,
                      backgroundColor:
                        assessmentColor[terminalFeedback.assessment] || "#111827",
                    }}
                  >
                    {terminalFeedback.assessment || "Unknown"}
                  </div>
                </div>

                <div>
                  <span style={styles.label}>Phase</span>
                  <p style={styles.paragraph}>
                    {terminalFeedback.phase || "general-navigation"}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Explanation</span>
                  <p style={styles.paragraph}>
                    {terminalFeedback.explanation || "No explanation available."}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Security Relevance</span>
                  <p style={styles.paragraph}>
                    {terminalFeedback.security_relevance ||
                      "No security relevance available."}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Next Step</span>
                  <p style={styles.paragraph}>
                    {terminalFeedback.next_step || "No next step suggested."}
                  </p>
                </div>

                {terminalFeedback.warning ? (
                  <div style={styles.warningBox}>
                    <strong>Warning:</strong> {terminalFeedback.warning}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={styles.emptyState}>
                Run a command in the terminal to receive AI guidance.
              </div>
            )}
          </section>
        </div>

        <div style={styles.rightColumn}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Lab Launcher</h2>
              <span style={styles.mutedText}>Training environment</span>
            </div>

            <button
              style={styles.primaryButton}
              onClick={handleLaunchLab}
              disabled={!sessionId || launchingLab}
            >
              {launchingLab
                ? "Launching..."
                : `Launch ${labDefinition?.name ?? "Juice Shop Lab"}`}
            </button>

            {labInfo ? (
              <div style={styles.metaStack}>
                <div style={styles.metaInlineRow}>
                  <span style={styles.metaLabel}>Attacker</span>
                  <span style={styles.metaValue}>{labInfo.attacker_container}</span>
                </div>
                <div style={styles.metaInlineRow}>
                  <span style={styles.metaLabel}>Target</span>
                  <span style={styles.metaValue}>{labInfo.target_container}</span>
                </div>
                <div style={styles.metaInlineRow}>
                  <span style={styles.metaLabel}>Network</span>
                  <span style={styles.metaValue}>{labInfo.network_name}</span>
                </div>
              </div>
            ) : null}
          </section>

          {labSteps && (
            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Lab Guide</h2>
                <span style={styles.mutedText}>
                  {labDefinition?.estimated_duration_minutes
                    ? `${labDefinition.estimated_duration_minutes} min estimate`
                    : "Step-by-step instructions"}
                </span>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
              <p style={styles.progressLabel}>{progressPercent}% complete</p>

              {labInfo?.browser_url && (
                <p style={styles.paragraph}>
                  <strong>Browser URL:</strong> {labInfo.browser_url}
                </p>
              )}

              {activeLabStep && activeTaskProgress?.ai_feedback ? (
                <div style={styles.activeTaskFeedbackBox}>
                  <span style={styles.label}>Active Task Feedback</span>
                  <p style={styles.paragraph}>{activeTaskProgress.ai_feedback}</p>
                  {activeTaskProgress.evidence_quality ? (
                    <p style={styles.paragraph}>
                      <strong>Evidence Quality:</strong>{" "}
                      {activeTaskProgress.evidence_quality}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div style={styles.feedbackStack}>
                {labSteps.map((step, i) => {
                  const stepProgress = taskProgress[step.task_id];
                  const isCompleted = completedSteps.includes(i);
                  const isActive = i === currentLabStep;
                  const isLocked = i > currentLabStep;
                  const displayStatus = isCompleted
                    ? "completed"
                    : stepProgress?.status === "off_track"
                    ? "off_track"
                    : stepProgress?.status === "attempted"
                    ? "attempted"
                    : isActive
                    ? "current"
                    : "pending";
                  const statusMeta = taskStatusMeta[displayStatus];
                  const stepAiMeta = stepProgress?.ai_status
                    ? aiStatusMeta[stepProgress.ai_status]
                    : null;
                  const stepEvidenceMeta = stepProgress?.evidence_quality
                    ? evidenceQualityMeta[stepProgress.evidence_quality]
                    : null;

                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.stepCard,
                        borderColor: isCompleted
                          ? "#16a34a"
                          : isActive
                          ? "#2563eb"
                          : "#e5e7eb",
                        backgroundColor: isCompleted
                          ? "#f0fdf4"
                          : isActive
                          ? "#eff6ff"
                          : "#ffffff",
                        opacity: isLocked ? 0.75 : 1,
                      }}
                    >
                      <div style={styles.cardHeader}>
                        <span style={styles.label}>
                          Step {i + 1}: {step.title}
                        </span>

                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: statusMeta.backgroundColor,
                            color: statusMeta.color,
                          }}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      <p style={styles.paragraph}>{step.instruction}</p>

                      <code style={styles.commandChip}>{step.command_hint}</code>

                      {stepAiMeta ? (
                        <div style={styles.detailBlock}>
                          <span style={styles.label}>Task Evaluation</span>
                          <div style={styles.badgeRow}>
                            <span
                              style={{
                                ...styles.statusBadge,
                                backgroundColor: stepAiMeta.backgroundColor,
                                color: stepAiMeta.color,
                              }}
                            >
                              {stepAiMeta.label}
                            </span>

                            {stepEvidenceMeta ? (
                              <span
                                style={{
                                  ...styles.statusBadge,
                                  backgroundColor: stepEvidenceMeta.backgroundColor,
                                  color: stepEvidenceMeta.color,
                                }}
                              >
                                {stepEvidenceMeta.label}
                              </span>
                            ) : null}
                          </div>

                          {stepProgress?.ai_feedback ? (
                            <p style={styles.paragraph}>{stepProgress.ai_feedback}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {stepProgress?.evidence_command || stepProgress?.ai_confidence ? (
                        <div style={styles.detailBlock}>
                          <span style={styles.label}>Evidence Review</span>
                          {stepProgress?.evidence_command ? (
                            <p style={styles.paragraph}>
                              <strong>Command:</strong> {stepProgress.evidence_command}
                            </p>
                          ) : null}
                          {stepProgress?.ai_confidence ? (
                            <p style={styles.paragraph}>
                              <strong>Confidence:</strong> {stepProgress.ai_confidence}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {step.hint_text ? (
                        <div style={styles.detailBlock}>
                          <span style={styles.label}>Hint</span>
                          <p style={styles.paragraph}>{step.hint_text}</p>
                        </div>
                      ) : null}

                      {step.remediation_text ? (
                        <div style={styles.detailBlock}>
                          <span style={styles.label}>Remediation Guidance</span>
                          <p style={styles.paragraph}>{step.remediation_text}</p>
                        </div>
                      ) : null}

                      {step.success_criteria?.length ? (
                        <div style={styles.detailBlock}>
                          <span style={styles.label}>Success Criteria</span>
                          <ul style={styles.list}>
                            {step.success_criteria.map((criterion, index) => (
                              <li key={index}>{criterion}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {isActive && step.step_type === "browser" ? (
                        <div style={styles.stepActionRow}>
                          <button
                            style={styles.secondaryButton}
                            onClick={handleCompleteBrowserStep}
                            type="button"
                          >
                            {step.manual_confirmation_label ||
                              "Mark Browser Step Complete"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {findingSuggestion && (
            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Suggested Finding</h2>
                <span style={styles.mutedText}>Detected from terminal output</span>
              </div>

              <div style={styles.feedbackStack}>
                <div>
                  <span style={styles.label}>Title</span>
                  <p style={styles.paragraph}>
                    {findingSuggestion.title || "Untitled finding"}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Severity</span>
                  <div style={severityBadgeStyle(findingSuggestion.severity)}>
                    {findingSuggestion.severity || "Medium"}
                  </div>
                </div>

                <div>
                  <span style={styles.label}>Description</span>
                  <p style={styles.paragraph}>
                    {findingSuggestion.description || "No description available."}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Evidence</span>
                  <pre style={styles.evidenceBox}>
                    {findingSuggestion.evidence || "No evidence provided."}
                  </pre>
                </div>

                <div style={styles.buttonRow}>
                  <button
                    style={styles.primaryButton}
                    onClick={handleAcceptSuggestion}
                    disabled={!sessionId || acceptingSuggestion}
                  >
                    {acceptingSuggestion ? "Saving..." : "Accept Finding"}
                  </button>

                  <button
                    style={styles.secondaryButton}
                    onClick={handleDismissSuggestion}
                    disabled={acceptingSuggestion}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </section>
          )}

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Add Finding</h2>
              <span style={styles.mutedText}>Capture vulnerabilities</span>
            </div>

            <form onSubmit={handleAddFinding} style={styles.form}>
              <input
                type="text"
                name="title"
                placeholder="Finding title"
                value={findingForm.title}
                onChange={handleChange}
                style={styles.input}
              />

              <select
                name="severity"
                value={findingForm.severity}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>

              <textarea
                name="description"
                placeholder="Describe the vulnerability"
                value={findingForm.description}
                onChange={handleChange}
                rows="5"
                style={styles.textarea}
              />

              <button
                type="submit"
                style={styles.primaryButton}
                disabled={!sessionId || savingFinding}
              >
                {savingFinding ? "Saving..." : "Save Finding"}
              </button>
            </form>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Findings</h2>
              <span style={styles.mutedText}>{findings.length} captured</span>
            </div>

            {findings.length > 0 ? (
              <div style={styles.findingsList}>
                {findings.map((finding, index) => (
                  <div key={finding.id ?? index} style={styles.findingCard}>
                    <div style={styles.findingTopRow}>
                      <strong style={styles.findingTitle}>{finding.title}</strong>
                      <div style={styles.findingBadgeRow}>
                        <span style={severityBadgeStyle(finding.severity)}>
                          {finding.severity}
                        </span>
                        {finding.description?.includes("Evidence:\n") ? (
                          <span style={styles.aiTag}>AI-assisted</span>
                        ) : null}
                      </div>
                    </div>
                    <p style={styles.findingDescription}>
                      {finding.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>
                No findings yet. Add one to show report value during the demo.
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>AI Report</h2>
              <span style={styles.mutedText}>Session summary</span>
            </div>

            {report ? (
              <div style={styles.reportStack}>
                <div>
                  <span style={styles.label}>Risk Level</span>
                  <div
                    style={{
                      ...styles.valuePill,
                      backgroundColor:
                        riskColor[report.analysis?.risk_level] || "#111827",
                    }}
                  >
                    {report.analysis?.risk_level ?? "Unknown"}
                  </div>
                </div>

                <div>
                  <span style={styles.label}>Summary</span>
                  <p style={styles.paragraph}>
                    {report.analysis?.summary || "No summary available."}
                  </p>
                </div>

                <div>
                  <span style={styles.label}>Key Issues</span>
                  {report.analysis?.key_issues?.length ? (
                    <ul style={styles.list}>
                      {report.analysis.key_issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={styles.paragraph}>No key issues returned.</p>
                  )}
                </div>

                <div>
                  <span style={styles.label}>Recommendations</span>
                  {report.analysis?.recommendations?.length ? (
                    <ul style={styles.list}>
                      {report.analysis.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={styles.paragraph}>No recommendations returned.</p>
                  )}
                </div>
              </div>
            ) : (
              <div style={styles.emptyState}>
                Generate a report after adding findings.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f3f6fb",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
    color: "#111827",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    color: "#0f172a",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "15px",
  },
  headerActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  banner: {
    marginBottom: "20px",
    backgroundColor: "#e0f2fe",
    color: "#075985",
    border: "1px solid #bae6fd",
    padding: "12px 14px",
    borderRadius: "12px",
    fontWeight: 600,
  },
  summaryHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  summaryTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 700,
    color: "#0f172a",
  },
  summaryProgressCircle: {
    minWidth: "110px",
    minHeight: "110px",
    borderRadius: "999px",
    border: "8px solid #dbeafe",
    backgroundColor: "#eff6ff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryProgressValue: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#1d4ed8",
    lineHeight: 1,
  },
  summaryProgressLabel: {
    marginTop: "6px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr",
    gap: "20px",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  rightColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  card: {
    background: "#ffffff",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
  },
  mutedText: {
    color: "#6b7280",
    fontSize: "13px",
  },
  primaryButton: {
    padding: "11px 16px",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryButton: {
    padding: "11px 16px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 700,
  },
  ghostButton: {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    cursor: "pointer",
  },
  buttonRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  statusBadge: {
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  metaItem: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
  },
  summaryStat: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  summaryStatValue: {
    fontWeight: 800,
    fontSize: "24px",
    color: "#0f172a",
  },
  summaryFindingValue: {
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.4,
  },
  summaryFindingBadge: {
    display: "inline-block",
    marginTop: "4px",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    backgroundColor: "#fff7ed",
    color: "#9a3412",
    alignSelf: "flex-start",
  },
  metaLabel: {
    display: "block",
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  metaValue: {
    fontWeight: 700,
    color: "#111827",
  },
  metaStack: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "14px",
  },
  metaInlineRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
  },
  emptyState: {
    padding: "18px",
    borderRadius: "12px",
    backgroundColor: "#f8fafc",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
  },
  feedbackStack: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  reportStack: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "6px",
  },
  valuePill: {
    display: "inline-block",
    color: "#fff",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 700,
  },
  paragraph: {
    margin: 0,
    lineHeight: 1.6,
    color: "#1f2937",
  },
  detailBlock: {
    marginTop: "12px",
  },
  warningBox: {
    backgroundColor: "#fff7ed",
    border: "1px solid #fdba74",
    color: "#9a3412",
    padding: "12px",
    borderRadius: "12px",
  },
  activeTaskFeedbackBox: {
    padding: "12px",
    borderRadius: "12px",
    backgroundColor: "#f8fafc",
    border: "1px solid #dbeafe",
  },
  commandList: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  commandChip: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    padding: "8px 10px",
    borderRadius: "10px",
    fontSize: "13px",
  },
  progressTrack: {
    width: "100%",
    height: "10px",
    borderRadius: "999px",
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
    marginBottom: "8px",
  },
  progressFill: {
    height: "100%",
    borderRadius: "999px",
    backgroundColor: "#2563eb",
    transition: "width 160ms ease",
  },
  progressLabel: {
    margin: "0 0 14px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 600,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "11px 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
  },
  textarea: {
    padding: "11px 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    resize: "vertical",
    outline: "none",
  },
  findingsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  findingCard: {
    padding: "14px",
    borderRadius: "12px",
    backgroundColor: "#f8fafc",
    border: "1px solid #e5e7eb",
  },
  findingTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    marginBottom: "8px",
    flexWrap: "wrap",
  },
  findingBadgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  findingTitle: {
    color: "#0f172a",
  },
  aiTag: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
  },
  findingDescription: {
    margin: 0,
    color: "#374151",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    color: "#1f2937",
    lineHeight: 1.6,
  },
  evidenceBox: {
    margin: 0,
    padding: "12px",
    borderRadius: "10px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: "13px",
  },
  summaryList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  summaryListItem: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#f8fafc",
  },
  summaryListTitle: {
    display: "block",
    marginBottom: "6px",
    color: "#0f172a",
  },
  summaryListText: {
    margin: 0,
    color: "#374151",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  stepCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "14px",
  },
  stepActionRow: {
    marginTop: "12px",
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },
};
*/
