import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  addFinding,
  completeTaskProgress,
  getFindings,
  getLabDefinition,
  getReport,
  getSession,
  getTaskProgress,
  launchLab,
  startSession,
} from "../api/Client";
import {
  DEFAULT_LAB_ID,
  LAB_CATALOG,
  getLabCatalogEntry,
} from "../config/labs";
import {
  buildTaskProgressMap,
  getSessionSummary,
  getStoredLabId,
  getStoredSessionId,
  mergeFindings,
  mergeLabSteps,
  setStoredLabId,
  setStoredSessionId,
  sortFindings,
} from "../utils/session";
import {
  getDefaultWorkflowState,
  getSessionWorkflow,
  getStoredWorkflowState,
  setStoredWorkflowState,
} from "../utils/workflow";
import { mergeFindingEvidenceContext } from "../utils/findings";

const SecureStackContext = createContext(null);

function buildPersistedLabInfo(sessionRecord) {
  if (!sessionRecord?.environment_launched_at) {
    return null;
  }

  return {
    attacker_container:
      sessionRecord.attacker_container ||
      (sessionRecord.id ? `attacker-${sessionRecord.id}` : null),
    target_container: sessionRecord.target_container || null,
    network_name: sessionRecord.network_name || null,
    browser_url: sessionRecord.browser_url || null,
  };
}

export function SecureStackProvider({ children }) {
  const initialSessionId = getStoredSessionId();
  const [activeLabId, setActiveLabId] = useState(() =>
    getStoredLabId(DEFAULT_LAB_ID)
  );
  const [labDefinitions, setLabDefinitions] = useState({});
  const [labCatalogLoading, setLabCatalogLoading] = useState(true);
  const [labCatalogError, setLabCatalogError] = useState("");
  const [sessionId, setSessionId] = useState(() => initialSessionId);
  const [report, setReport] = useState(null);
  const [sessionRecord, setSessionRecord] = useState(null);
  const [message, setMessage] = useState("");
  const [terminalFeedback, setTerminalFeedback] = useState(null);
  const [findingSuggestion, setFindingSuggestion] = useState(null);
  const [findings, setFindings] = useState([]);
  const [labInfo, setLabInfo] = useState(null);
  const [startingSession, setStartingSession] = useState(false);
  const [savingFinding, setSavingFinding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);
  const [launchingLab, setLaunchingLab] = useState(false);
  const [taskProgress, setTaskProgress] = useState({});
  const [sessionSyncing, setSessionSyncing] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState("");
  const [findingForm, setFindingForm] = useState({
    title: "",
    severity: "Medium",
    description: "",
  });
  const [workflowState, setWorkflowState] = useState(() =>
    getStoredWorkflowState(initialSessionId)
  );
  const [workflowStateSessionId, setWorkflowStateSessionId] =
    useState(initialSessionId);

  const activeLabConfig = getLabCatalogEntry(activeLabId);
  const activeLabDefinition = labDefinitions[activeLabId] || null;
  const [labSteps, setLabSteps] = useState(activeLabDefinition?.tasks || []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLabCatalogLoading(true);
      setLabCatalogError("");

      try {
        const definitions = await Promise.all(
          LAB_CATALOG.map(async (lab) => {
            const definition = await getLabDefinition(lab.labId);
            return [lab.labId, definition];
          })
        );

        if (cancelled) {
          return;
        }

        setLabDefinitions(Object.fromEntries(definitions));
      } catch (error) {
        if (!cancelled) {
          console.error("Lab catalog load error:", error);
          setLabCatalogError(error.message || "Failed to load lab catalog.");
        }
      } finally {
        if (!cancelled) {
          setLabCatalogLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeLabDefinition?.tasks) {
      return;
    }

    setLabSteps((prevSteps) =>
      prevSteps?.length
        ? mergeLabSteps(activeLabDefinition.tasks || [], prevSteps || [])
        : activeLabDefinition.tasks || []
    );
  }, [activeLabDefinition]);

  useEffect(() => {
    setStoredSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setWorkflowStateSessionId(null);
      setWorkflowState(getDefaultWorkflowState());
      return;
    }

    setWorkflowStateSessionId(sessionId);
    setWorkflowState(getStoredWorkflowState(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || workflowStateSessionId !== sessionId) {
      return;
    }

    setStoredWorkflowState(sessionId, workflowState);
  }, [sessionId, workflowState, workflowStateSessionId]);

  useEffect(() => {
    setStoredLabId(activeLabId);
  }, [activeLabId]);

  useEffect(() => {
    if (!sessionId) {
      setSessionRecord(null);
      setTaskProgress({});
      setFindings([]);
      setSessionSyncing(false);
      return;
    }

    let cancelled = false;
    setSessionSyncing(true);
    setSessionLoadError("");

    async function syncSessionData() {
      try {
        const sessionData = await getSession(sessionId);
        if (!cancelled) {
          setSessionRecord(sessionData);
          setLabInfo(buildPersistedLabInfo(sessionData));
          if (sessionData.lab_id) {
            setActiveLabId(sessionData.lab_id);
            const syncedDefinition = labDefinitions[sessionData.lab_id];
            if (syncedDefinition?.tasks?.length) {
              setLabSteps(syncedDefinition.tasks);
            }
          }
        }
      } catch (error) {
        console.error("Session sync error:", error);

        if (!cancelled) {
          if (error.message === "Session not found") {
            setSessionId(null);
            setSessionRecord(null);
            setLabInfo(null);
            setTaskProgress({});
            setFindings([]);
            setSessionLoadError("Session not found.");
            setMessage("Previous session could not be restored.");
            setSessionSyncing(false);
            return;
          }

          setSessionRecord(null);
          setLabInfo(null);
          setTaskProgress({});
          setFindings([]);
          setSessionLoadError(error.message || "Failed to load session.");
          setSessionSyncing(false);
        }

        return;
      }

      try {
        const progressRecords = await getTaskProgress(sessionId);
        if (!cancelled) {
          setTaskProgress(buildTaskProgressMap(progressRecords));
        }
      } catch (error) {
        console.error("Task progress sync error:", error);

        if (!cancelled && error.message === "Session not found") {
          setSessionId(null);
          setTaskProgress({});
          setSessionLoadError("Session not found.");
          setMessage("Previous session could not be restored.");
          setSessionSyncing(false);
          return;
        }
      }

      try {
        const findingRecords = await getFindings(sessionId);
        if (!cancelled) {
          setFindings(sortFindings(findingRecords));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Findings sync error:", error);
        }
      } finally {
        if (!cancelled) {
          setSessionSyncing(false);
        }
      }
    }

    syncSessionData();

    return () => {
      cancelled = true;
    };
  }, [labDefinitions, sessionId]);

  const labCatalog = LAB_CATALOG.map((lab) => ({
    ...lab,
    ...(labDefinitions[lab.labId] || {}),
  }));

  const summary = getSessionSummary({
    labSteps,
    taskProgress,
    findings,
  });
  const workflow = getSessionWorkflow({
    sessionId,
    sessionRecord,
    summary,
    labSteps,
    labInfo,
    report,
    findings,
    taskProgress,
    workflowState,
  });

  async function ensureLabDefinition(labId = activeLabId) {
    const existing = labDefinitions[labId];
    if (existing) {
      return existing;
    }

    const definition = await getLabDefinition(labId);
    setLabDefinitions((prev) => ({
      ...prev,
      [labId]: definition,
    }));
    return definition;
  }

  function resetTransientSessionState(definition) {
    setTaskProgress({});
    setReport(null);
    setSessionRecord(null);
    setTerminalFeedback(null);
    setFindingSuggestion(null);
    setFindings([]);
    setLabInfo(null);
    setLabSteps(definition?.tasks || []);
    setSessionLoadError("");
    setWorkflowState(getDefaultWorkflowState());
  }

  async function startNewSession(labId = activeLabId) {
    const labConfig = getLabCatalogEntry(labId);
    setStartingSession(true);
    setMessage("");
    setSessionLoadError("");
    setActiveLabId(labId);

    try {
      const definition = await ensureLabDefinition(labId).catch((error) => {
        console.error("Lab definition refresh error:", error);
        return labDefinitions[labId] || null;
      });

      const result = await startSession(labConfig.sessionLabName, labId);
      const nextWorkflowState = {
        ...getDefaultWorkflowState(),
        sessionStartedAt: result.start_time || new Date().toISOString(),
      };
      setStoredWorkflowState(result.id, nextWorkflowState);
      setSessionId(result.id);
      setWorkflowStateSessionId(result.id);
      resetTransientSessionState(definition);
      setSessionRecord(result);
      setWorkflowState(nextWorkflowState);
      setMessage(`Session ${result.id} started successfully.`);
      return result;
    } catch (error) {
      console.error("Start session error:", error);
      setMessage(error.message || "Failed to start session.");
      throw error;
    } finally {
      setStartingSession(false);
    }
  }

  function selectLab(labId) {
    setActiveLabId(labId);
    const definition = labDefinitions[labId];
    if (definition?.tasks) {
      setLabSteps(definition.tasks);
    }
  }

  function setSessionFromRoute(nextSessionId, labId = activeLabId) {
    if (!nextSessionId || Number.isNaN(nextSessionId)) {
      return;
    }

    setSessionLoadError("");
    setActiveLabId(labId);
    setSessionId(nextSessionId);
    setSessionRecord(null);
    setWorkflowStateSessionId(nextSessionId);
    setWorkflowState(getStoredWorkflowState(nextSessionId));
    setReport(null);
    setTaskProgress({});
    setFindings([]);
    setTerminalFeedback(null);
    setFindingSuggestion(null);
    setLabInfo(null);

    const definition = labDefinitions[labId];
    if (definition?.tasks) {
      setLabSteps(definition.tasks);
    }
  }

  async function launchActiveLab() {
    if (!sessionId) {
      const error = new Error("Start a session first.");
      setMessage(error.message);
      throw error;
    }

    setLaunchingLab(true);
    setMessage("");

    try {
      const definition = await ensureLabDefinition(activeLabId);
      const data = await launchLab(sessionId, activeLabId);
      setLabSteps(mergeLabSteps(definition?.tasks || [], data.steps || []));
      setLabInfo(data);
      setSessionRecord((prev) =>
        prev
          ? {
              ...prev,
              lab_id: activeLabId,
              environment_launched_at: new Date().toISOString(),
              attacker_container: data.attacker_container || prev.attacker_container,
              target_container: data.target_container || prev.target_container,
              network_name: data.network_name || prev.network_name,
              browser_url: data.browser_url || prev.browser_url,
            }
          : prev
      );
      setWorkflowState((prev) => ({
        ...prev,
        environmentLaunchedAt:
          prev.environmentLaunchedAt || new Date().toISOString(),
      }));
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setMessage("Lab launched successfully.");
      return data;
    } catch (error) {
      console.error("Lab launch error:", error);
      setMessage(error.message || "Failed to launch lab.");
      throw error;
    } finally {
      setLaunchingLab(false);
    }
  }

  async function persistTaskCompletion({
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
  }) {
    if (!sessionId || !task?.task_id) {
      return null;
    }

    const existingProgress = taskProgress[task.task_id];
    if (existingProgress?.status === "completed") {
      return existingProgress;
    }

    const savedProgress = await completeTaskProgress({
      session_id: sessionId,
      lab_id: activeLabDefinition?.lab_id || activeLabId,
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
  }

  function handleTerminalFeedback(feedback) {
    setTerminalFeedback(feedback);
  }

  const recordVisitedSection = useCallback((sectionSlug) => {
    if (!sectionSlug) {
      return;
    }

    setWorkflowState((prev) => {
      if (prev.visitedSections.includes(sectionSlug)) {
        return prev;
      }

      return {
        ...prev,
        visitedSections: [...prev.visitedSections, sectionSlug],
        sectionHistory: [
          ...prev.sectionHistory,
          {
            section: sectionSlug,
            visitedAt: new Date().toISOString(),
          },
        ],
      };
    });
  }, []);

  const handleCommandSubmitted = useCallback((command) => {
    const nextCommand = command?.trim();

    if (!nextCommand) {
      return;
    }

    setWorkflowState((prev) => ({
      ...prev,
      commandsRunCount: prev.commandsRunCount + 1,
      lastCommand: nextCommand,
      lastCommandAt: new Date().toISOString(),
    }));
  }, []);

  function clearFeedback() {
    setTerminalFeedback(null);
  }

  function handleFindingSuggestion(suggestion) {
    setFindingSuggestion(suggestion);
  }

  function handleAutoSavedFinding(savedFinding) {
    setFindings((prev) => sortFindings(mergeFindings(prev, [savedFinding])));
    setWorkflowState((prev) => ({
      ...prev,
      findingHistory: [
        ...prev.findingHistory,
        {
          title: savedFinding.title || "Auto-saved finding",
          severity: savedFinding.severity || "Medium",
          source: "ai_auto_saved",
          createdAt: savedFinding.created_at || new Date().toISOString(),
        },
      ].slice(-12),
    }));
    setFindingSuggestion(null);
    setMessage(`AI auto-saved finding: ${savedFinding.title}`);
  }

  async function handleCommandResult({ command, output, feedback }) {
    if (!labSteps?.length || summary.currentLabStepIndex >= labSteps.length) {
      return;
    }

    setWorkflowState((prev) => ({
      ...prev,
      lastCommand: command?.trim() || prev.lastCommand,
      lastCommandAt: prev.lastCommandAt || new Date().toISOString(),
      lastFeedbackAt: new Date().toISOString(),
    }));

    const activeStep = labSteps[summary.currentLabStepIndex];
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
        setMessage(`Step ${summary.currentLabStepIndex + 1} completed.`);
      } else if (savedProgress?.status === "off_track") {
        setMessage(
          `Step ${summary.currentLabStepIndex + 1} is still waiting for the expected command.`
        );
      } else {
        setMessage(
          `Step ${summary.currentLabStepIndex + 1} needs stronger evidence before it can be completed.`
        );
      }
    } catch (error) {
      console.error("Task completion persistence error:", error);
      setMessage(error.message || "Failed to save task progress.");
    }
  }

  async function completeBrowserStep() {
    if (!summary.activeLabStep || summary.activeLabStep.step_type !== "browser") {
      return;
    }

    try {
      await persistTaskCompletion({
        task: summary.activeLabStep,
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
      setMessage(`Step ${summary.currentLabStepIndex + 1} completed.`);
    } catch (error) {
      console.error("Browser step persistence error:", error);
      setMessage(error.message || "Failed to save task progress.");
    }
  }

  function updateFindingForm(event) {
    const { name, value } = event.target;
    setFindingForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function applyEvidenceFindingDraft() {
    if (!workflow.evidenceContext?.hasEvidence) {
      setMessage("Run a command first so the finding draft has evidence to use.");
      return;
    }

    setFindingForm({
      title: workflow.evidenceContext.draftTitle,
      severity: "Medium",
      description: workflow.evidenceContext.draftDescription,
    });
    setMessage("Evidence-aware finding draft applied.");
  }

  async function saveFinding(event) {
    event.preventDefault();

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
        source: "manual",
        task_id: workflow.activeTask?.task_id || null,
        task_label: workflow.evidenceContext.taskContext || null,
        task_objective: workflow.evidenceContext.taskObjective || null,
        evidence_command: workflow.evidenceContext.recentCommand || null,
        evidence_snapshot: workflow.evidenceContext.evidence || null,
        description: mergeFindingEvidenceContext(
          findingForm.description.trim(),
          workflow.evidenceContext
        ),
      };

      const saved = await addFinding(payload);

      setFindings((prev) =>
        sortFindings(
          mergeFindings(prev, [
            saved?.id
              ? saved
              : {
                  id: Date.now(),
                  ...payload,
                },
          ])
        )
      );
      setWorkflowState((prev) => ({
        ...prev,
        findingHistory: [
          ...prev.findingHistory,
          {
            title: payload.title,
            severity: payload.severity,
            source: "manual",
            createdAt: saved?.created_at || new Date().toISOString(),
          },
        ].slice(-12),
      }));

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
  }

  async function acceptSuggestedFinding() {
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
        source: "ai_suggestion",
        task_id: workflow.activeTask?.task_id || null,
        task_label: workflow.evidenceContext.taskContext || null,
        task_objective: workflow.evidenceContext.taskObjective || null,
        evidence_command: workflow.evidenceContext.recentCommand || null,
        evidence_snapshot:
          findingSuggestion.evidence || workflow.evidenceContext.evidence || null,
        description: mergeFindingEvidenceContext(
          [
            findingSuggestion.description || "",
            findingSuggestion.evidence
              ? `Evidence:\n${findingSuggestion.evidence}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          workflow.evidenceContext
        ),
      };

      const saved = await addFinding(payload);

      setFindings((prev) =>
        sortFindings(
          mergeFindings(prev, [
            saved?.id
              ? saved
              : {
                  id: Date.now(),
                  ...payload,
                },
          ])
        )
      );
      setWorkflowState((prev) => ({
        ...prev,
        findingHistory: [
          ...prev.findingHistory,
          {
            title: payload.title,
            severity: payload.severity,
            source: "ai_suggestion",
            createdAt: saved?.created_at || new Date().toISOString(),
          },
        ].slice(-12),
      }));

      setFindingSuggestion(null);
      setMessage("Suggested finding accepted and saved.");
    } catch (error) {
      console.error("Accept suggested finding error:", error);
      setMessage("Failed to save suggested finding.");
    } finally {
      setAcceptingSuggestion(false);
    }
  }

  function dismissSuggestedFinding() {
    setFindingSuggestion(null);
  }

  async function generateSessionReport() {
    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    setGeneratingReport(true);
    setMessage("");

    try {
      const response = await getReport(sessionId);
      setReport(response);
      setSessionRecord((prev) => response.session || prev);

      if (Array.isArray(response?.findings)) {
        setFindings((prev) => sortFindings(mergeFindings(prev, response.findings)));
      }
      setWorkflowState((prev) => ({
        ...prev,
        reportGeneratedAt: new Date().toISOString(),
      }));

      setMessage("Report generated successfully.");
      return response;
    } catch (error) {
      console.error("Generate report error:", error);
      setMessage("Failed to generate report.");
      throw error;
    } finally {
      setGeneratingReport(false);
    }
  }

  function clearMessage() {
    setMessage("");
  }

  const value = {
    activeLabId,
    activeLabConfig,
    activeLabDefinition,
    labCatalog,
    labCatalogLoading,
    labCatalogError,
    sessionId,
    sessionRecord,
    report,
    message,
    sessionSyncing,
    sessionLoadError,
    terminalFeedback,
    findingSuggestion,
    findings,
    labInfo,
    startingSession,
    savingFinding,
    generatingReport,
    acceptingSuggestion,
    launchingLab,
    labSteps,
    taskProgress,
    findingForm,
    summary,
    workflow,
    selectLab,
    startNewSession,
    setSessionFromRoute,
    launchActiveLab,
    handleTerminalFeedback,
    handleCommandSubmitted,
    clearFeedback,
    handleFindingSuggestion,
    handleAutoSavedFinding,
    handleCommandResult,
    recordVisitedSection,
    completeBrowserStep,
    updateFindingForm,
    applyEvidenceFindingDraft,
    saveFinding,
    acceptSuggestedFinding,
    dismissSuggestedFinding,
    generateSessionReport,
    clearMessage,
    ensureLabDefinition,
  };

  return (
    <SecureStackContext.Provider value={value}>
      {children}
    </SecureStackContext.Provider>
  );
}

export function useSecureStack() {
  const context = useContext(SecureStackContext);

  if (!context) {
    throw new Error("useSecureStack must be used within a SecureStackProvider");
  }

  return context;
}
