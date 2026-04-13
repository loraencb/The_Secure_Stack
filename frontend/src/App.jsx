import { useState, useCallback } from "react";
import { startSession, launchLab, addFinding, getReport } from "./api/Client";
import LiveTerminal from "./components/LiveTerminal";

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

export default function App() {
  const [sessionId, setSessionId] = useState(null);
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

    setCurrentLabStep(0);
    setCompletedSteps([]);
    try {
      const res = await startSession("juice-shop");
      setSessionId(res.id);
      setReport(null);
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setFindings([]);
      setLabInfo(null);
      setLabSteps(null);
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
    setCurrentLabStep(0);
    setCompletedSteps([]);
    try {
      const data = await launchLab(sessionId, "juice-shop-recon");
      setLabSteps(data.steps || []);
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
  
  const normalizeCommand = (command) => command.trim().toLowerCase();

  const getCurrentStep = useCallback(() => {
    if (!labSteps?.length) return null;
    return labSteps[currentLabStep] || null;
  }, [labSteps, currentLabStep]);

  const completeCurrentStep = useCallback(
    (successMessage) => {
      const activeStep = getCurrentStep();
      if (!activeStep) return;

      setCompletedSteps((prev) => {
        if (prev.includes(currentLabStep)) return prev;
        return [...prev, currentLabStep];
      });

      setCurrentLabStep((prev) => Math.min(prev + 1, labSteps.length));
      setMessage(successMessage);
    },
    [currentLabStep, getCurrentStep, labSteps]
  );

  const commandMatchesStep = useCallback((command, hint) => {
    const c = normalizeCommand(command);
    const h = normalizeCommand(hint);

    if (h.includes("ping") && c.includes("ping")) return true;
    if (h.includes("nmap") && c.includes("nmap")) return true;
    if (h.includes("curl") && c.includes("curl")) return true;
    if (h.startsWith("http://") || h.startsWith("https://")) return false;

    return c === h;
  }, []);

  const handleCommandSubmitted = useCallback(
    (command) => {
      if (!labSteps || labSteps.length === 0) return;
      if (currentLabStep >= labSteps.length) return;

      const activeStep = labSteps[currentLabStep];
      const expectedHint = activeStep?.command_hint || "";
      const stepType = activeStep?.step_type || "command";

      if (stepType !== "command") return;

      if (commandMatchesStep(command, expectedHint)) {
        completeCurrentStep(`Step ${currentLabStep + 1} completed.`);
      }
    },
    [labSteps, currentLabStep, completeCurrentStep, commandMatchesStep]
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

  const activeLabStep = getCurrentStep();
  const totalSteps = labSteps?.length || 0;
  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps.length / totalSteps) * 100) : 0;

  const handleCompleteBrowserStep = () => {
    if (!activeLabStep || activeLabStep.step_type !== "browser") {
      return;
    }

    completeCurrentStep(`Step ${currentLabStep + 1} completed.`);
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
                <span style={styles.metaValue}>juice-shop</span>
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
              {launchingLab ? "Launching..." : "Launch Juice Shop Lab"}
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
                <span style={styles.mutedText}>Step-by-step instructions</span>
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

              <div style={styles.feedbackStack}>
                {labSteps.map((step, i) => {
                  const isCompleted = completedSteps.includes(i);
                  const isActive = i === currentLabStep;
                  const isLocked = i > currentLabStep;

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
                            backgroundColor: isCompleted
                              ? "#dcfce7"
                              : isActive
                              ? "#dbeafe"
                              : "#e5e7eb",
                            color: isCompleted
                              ? "#166534"
                              : isActive
                              ? "#1d4ed8"
                              : "#374151",
                          }}
                        >
                          {isCompleted ? "Completed" : isActive ? "Current" : "Pending"}
                        </span>
                      </div>

                      <p style={styles.paragraph}>{step.instruction}</p>

                      <code style={styles.commandChip}>{step.command_hint}</code>

                      {isActive && step.step_type === "browser" ? (
                        <div style={styles.stepActionRow}>
                          <button
                            style={styles.secondaryButton}
                            onClick={handleCompleteBrowserStep}
                            type="button"
                          >
                            Mark Browser Step Complete
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
  metaItem: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
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
  warningBox: {
    backgroundColor: "#fff7ed",
    border: "1px solid #fdba74",
    color: "#9a3412",
    padding: "12px",
    borderRadius: "12px",
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
};
