import { useMemo, useState } from "react";
import { startSession, addFinding, getReport } from "./api/client";
import LiveTerminal from "./components/LiveTerminal";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [terminalFeedback, setTerminalFeedback] = useState(null);
  const [findingSuggestion, setFindingSuggestion] = useState(null);
  const [findings, setFindings] = useState([]);

  const [startingSession, setStartingSession] = useState(false);
  const [savingFinding, setSavingFinding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState(false);
  const [labSteps, setLabSteps] = useState(null);
  const [launchingLab, setLaunchingLab] = useState(false);
  const [findingForm, setFindingForm] = useState({
    title: "",
    severity: "Medium",
    description: "",
  });
  const handleLaunchLab = async () => {
    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    setLaunchingLab(true);
    setMessage("");

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/labs/launch/${sessionId}/juice-shop`,
        { method: "POST" }
      );

      const data = await res.json();

      setLabSteps(data.steps);
      setMessage("Lab launched successfully.");
    } catch (error) {
      console.error("Lab launch error:", error);
      setMessage("Failed to launch lab.");
    } finally {
      setLaunchingLab(false);
    }
  };
  const handleAutoSavedFinding = (savedFinding) => {
    setFindings((prev) => {
      const exists = prev.some((f) => f.id === savedFinding.id);
      if (exists) return prev;
      return [...prev, savedFinding];
    });

    setFindingSuggestion(null);
    setMessage(`AI auto-saved finding: ${savedFinding.title}`);
  };
  
  const handleStartSession = async () => {
    setStartingSession(true);
    setMessage("");

    try {
      const res = await startSession("juice-shop");
      setSessionId(res.id);
      setReport(null);
      setTerminalFeedback(null);
      setFindingSuggestion(null);
      setFindings([]);
      setMessage(`Session ${res.id} started successfully.`);
    } catch (error) {
      console.error("Start session error:", error);
      setMessage("Failed to start session.");
    } finally {
      setStartingSession(false);
    }
  };

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

  const demoCommands = useMemo(
    () => [
      "pwd",
      "ls",
      "whoami",
      "uname -a",
      "ip a",
      "ps aux",
      "cat /etc/os-release",
    ],
    []
  );

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
                  {terminalFeedback ? "Live" : "Waiting"}
                </span>
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Live Terminal</h2>
              <span style={styles.mutedText}>Linux container shell</span>
            </div>

            {sessionId ? (
              <LiveTerminal
                sessionId={sessionId}
                onFeedback={setTerminalFeedback}
                onFindingSuggestion={setFindingSuggestion}
                onFindingAutoSaved={handleAutoSavedFinding}
              />
            ) : (
              <div style={styles.emptyState}>
                Start a session to open the terminal.
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
          </section>

          {labSteps && (
            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Lab Guide</h2>
                <span style={styles.mutedText}>Step-by-step instructions</span>
              </div>

              <div style={styles.feedbackStack}>
                {labSteps.map((step, i) => (
                  <div key={i}>
                    <span style={styles.label}>
                      Step {i + 1}: {step.title}
                    </span>

                    <p style={styles.paragraph}>{step.instruction}</p>

                    <code style={styles.commandChip}>
                      {step.command_hint}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          )}
          
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Suggested Demo Commands</h2>
              <span style={styles.mutedText}>Use these during presentation</span>
            </div>

            <div style={styles.commandList}>
              {demoCommands.map((cmd) => (
                <code key={cmd} style={styles.commandChip}>
                  {cmd}
                </code>
              ))}
            </div>
          </section>

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
                      <span style={severityBadgeStyle(finding.severity)}>
                        {finding.severity}
                      </span>
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
  findingTitle: {
    color: "#0f172a",
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
};