import { useCallback, useState } from "react";
import {
  startSession,
  addFinding,
  getReport,
  launchLab,
} from "./api/client";
import LiveTerminal from "./components/LiveTerminal";
import SessionStatusCard from "./components/SessionStatusCard";
import LabLauncherCard from "./components/LabLauncherCard";
import LabGuideCard from "./components/LabGuideCard";
import AIFeedbackCard from "./components/AIFeedbackCard";
import FindingSuggestionCard from "./components/FindingSuggestionCard";
import FindingFormCard from "./components/FindingFormCard";
import FindingsListCard from "./components/FindingsListCard";
import ReportCard from "./components/ReportCard";
import {
  styles,
  severityBadgeStyle,
  riskColor,
  assessmentColor,
} from "./styles/appStyles";

const DEFAULT_LAB_ID = "juice-shop-recon";
const DEFAULT_LAB_NAME = "juice-shop";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");

  const [terminalFeedback, setTerminalFeedback] = useState(null);
  const [findingSuggestion, setFindingSuggestion] = useState(null);
  const [findings, setFindings] = useState([]);

  const [labInfo, setLabInfo] = useState(null);
  const [labSteps, setLabSteps] = useState(null);

  const [startingSession, setStartingSession] = useState(false);
  const [launchingLab, setLaunchingLab] = useState(false);
  const [savingFinding, setSavingFinding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);

  const [currentLabStep, setCurrentLabStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);

  const [findingForm, setFindingForm] = useState({
    title: "",
    severity: "Medium",
    description: "",
  });

  const handleStartSession = async () => {
    setStartingSession(true);
    setMessage("");

    try {
      const res = await startSession(DEFAULT_LAB_NAME);
      setSessionId(res.id);
      setReport(null);
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setFindings([]);
      setLabInfo(null);
      setLabSteps(null);
      setCurrentLabStep(0);
      setCompletedSteps([]);
      setMessage(`Session ${res.id} started successfully.`);
    } catch (error) {
      console.error("Start session error:", error);
      setMessage("Failed to start session.");
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
    setCurrentLabStep(0);
    setCompletedSteps([]);

    try {
      const data = await launchLab(sessionId, DEFAULT_LAB_ID);
      const details = data.details ?? data;

      setLabSteps(details.steps ?? []);
      setLabInfo(details);
      setMessage("Lab launched successfully.");
    } catch (error) {
      console.error("Lab launch error:", error);
      setMessage(error.message || "Failed to launch lab.");
    } finally {
      setLaunchingLab(false);
    }
  };

  const normalizeCommand = (command) => command.trim().toLowerCase();

  const commandMatchesStep = (command, hint) => {
    const c = normalizeCommand(command);
    const h = normalizeCommand(hint || "");

    if (h.includes("ping") && c.includes("ping")) return true;
    if (h.includes("nmap") && c.includes("nmap")) return true;
    if (h.includes("curl") && c.includes("curl")) return true;
    if (h.startsWith("http://") || h.startsWith("https://")) return false;

    return c === h;
  };

  const handleCommandSubmitted = useCallback(
    (command) => {
      if (!labSteps || labSteps.length === 0) return;
      if (currentLabStep >= labSteps.length) return;

      const activeStep = labSteps[currentLabStep];
      const expectedHint = activeStep?.command_hint || "";

      if (commandMatchesStep(command, expectedHint)) {
        setCompletedSteps((prev) => {
          if (prev.includes(currentLabStep)) return prev;
          return [...prev, currentLabStep];
        });

        setCurrentLabStep((prev) => prev + 1);
        setMessage(`Step ${currentLabStep + 1} completed.`);
      }
    },
    [labSteps, currentLabStep]
  );

  const handleAutoSavedFinding = useCallback((savedFinding) => {
    setFindings((prev) => {
      const exists = prev.some((f) => f.id === savedFinding.id);
      if (exists) return prev;
      return [...prev, savedFinding];
    });

    setFindingSuggestion(null);
    setMessage(`AI auto-saved finding: ${savedFinding.title}`);
  }, []);

  const handleTerminalFeedback = useCallback((feedback) => {
    setTerminalFeedback(feedback);
  }, []);

  const handleFindingSuggestion = useCallback((suggestion) => {
    setFindingSuggestion(suggestion);
  }, []);

  const handleChangeFindingForm = (e) => {
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

      setFindings((prev) => [
        ...prev,
        saved?.id
          ? saved
          : {
              id: Date.now(),
              ...payload,
            },
      ]);

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

      setFindings((prev) => [
        ...prev,
        saved?.id
          ? saved
          : {
              id: Date.now(),
              ...payload,
            },
      ]);

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
        setFindings(res.findings);
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
          <SessionStatusCard
            sessionId={sessionId}
            findingsCount={findings.length}
            hasLiveFeedback={Boolean(terminalFeedback)}
            labName={DEFAULT_LAB_NAME}
          />

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
                onCommandSubmitted={handleCommandSubmitted}
              />
            ) : (
              <div style={styles.emptyState}>
                Launch a lab to open the terminal.
              </div>
            )}
          </section>

          <AIFeedbackCard
            terminalFeedback={terminalFeedback}
            clearFeedback={clearFeedback}
            assessmentColor={assessmentColor}
          />
        </div>

        <div style={styles.rightColumn}>
          <LabLauncherCard
            sessionId={sessionId}
            launchingLab={launchingLab}
            onLaunchLab={handleLaunchLab}
          />

          <LabGuideCard
            labSteps={labSteps}
            labInfo={labInfo}
            currentLabStep={currentLabStep}
            completedSteps={completedSteps}
          />

          <FindingSuggestionCard
            findingSuggestion={findingSuggestion}
            severityBadgeStyle={severityBadgeStyle}
            acceptingSuggestion={acceptingSuggestion}
            sessionId={sessionId}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
          />

          <FindingFormCard
            findingForm={findingForm}
            savingFinding={savingFinding}
            sessionId={sessionId}
            onChange={handleChangeFindingForm}
            onSubmit={handleAddFinding}
          />

          <FindingsListCard
            findings={findings}
            severityBadgeStyle={severityBadgeStyle}
          />

          <ReportCard
            report={report}
            riskColor={riskColor}
          />
        </div>
      </div>
    </div>
  );
}