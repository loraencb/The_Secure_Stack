import { useState } from "react";
import { startSession, addFinding, getReport } from "./api/client";
import LiveTerminal from "./components/LiveTerminal";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [terminalFeedback, setTerminalFeedback] = useState(null);

  const [findingForm, setFindingForm] = useState({
    title: "",
    severity: "Medium",
    description: "",
  });

  const handleStartSession = async () => {
    try {
      const res = await startSession("juice-shop");
      setSessionId(res.id);
      setReport(null);
      setTerminalFeedback(null);
      setMessage(`Session ${res.id} started.`);
    } catch (error) {
      console.error("Start session error:", error);
      setMessage("Failed to start session.");
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

    try {
      await addFinding({
        session_id: sessionId,
        title: findingForm.title.trim(),
        severity: findingForm.severity,
        description: findingForm.description.trim(),
      });

      setMessage("Finding added successfully.");
      setFindingForm({
        title: "",
        severity: "Medium",
        description: "",
      });
    } catch (error) {
      console.error("Add finding error:", error);
      setMessage("Failed to add finding.");
    }
  };

  const handleGenerateReport = async () => {
    if (!sessionId) {
      setMessage("Start a session first.");
      return;
    }

    try {
      const res = await getReport(sessionId);
      setReport(res);
      setMessage("Report generated.");
    } catch (error) {
      console.error("Generate report error:", error);
      setMessage("Failed to generate report.");
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

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🔐 Secure Stack Dashboard</h1>

      <div style={styles.card}>
        <h2>Session Controls</h2>
        <div style={styles.buttonRow}>
          <button style={styles.button} onClick={handleStartSession}>
            Start Session
          </button>
          <button style={styles.button} onClick={handleGenerateReport}>
            Generate Report
          </button>
        </div>

        <p>
          <strong>Active Session ID:</strong> {sessionId ?? "None"}
        </p>

        {message && <p style={styles.message}>{message}</p>}
      </div>

      <div style={styles.card}>
        <h2>Add Finding</h2>
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
            rows="4"
            style={styles.textarea}
          />

          <button type="submit" style={styles.button}>
            Save Finding
          </button>
        </form>
      </div>

      {sessionId && (
        <div style={styles.card}>
          <h2>Live Terminal</h2>
          <p style={styles.subtext}>
            Terminal connected to the active training session.
          </p>
          <LiveTerminal
            sessionId={sessionId}
            onFeedback={setTerminalFeedback}
          />
        </div>
      )}

      {terminalFeedback && (
        <div style={styles.card}>
          <h2>AI Live Feedback</h2>

          <p>
            <strong>Assessment:</strong>{" "}
            <span
              style={{
                color:
                  assessmentColor[terminalFeedback.assessment] || "#111827",
                fontWeight: "bold",
              }}
            >
              {terminalFeedback.assessment || "Unknown"}
            </span>
          </p>

          <p>
            <strong>Explanation:</strong> {terminalFeedback.explanation}
          </p>

          <p>
            <strong>Security Relevance:</strong>{" "}
            {terminalFeedback.security_relevance}
          </p>

          <p>
            <strong>Next Step:</strong> {terminalFeedback.next_step || "None"}
          </p>

          {terminalFeedback.warning && (
            <p>
              <strong>Warning:</strong> {terminalFeedback.warning}
            </p>
          )}
        </div>
      )}

      {report && (
        <div style={styles.card}>
          <h2>AI Analysis</h2>

          <p>
            <strong>Risk Level:</strong>{" "}
            <span
              style={{
                color: riskColor[report.analysis?.risk_level] || "#111827",
                fontWeight: "bold",
              }}
            >
              {report.analysis?.risk_level ?? "Unknown"}
            </span>
          </p>

          <p>{report.analysis?.summary}</p>

          <h3>Key Issues</h3>
          {report.analysis?.key_issues?.length ? (
            <ul>
              {report.analysis.key_issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p>No key issues returned.</p>
          )}

          <h3>Recommendations</h3>
          {report.analysis?.recommendations?.length ? (
            <ul>
              {report.analysis.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          ) : (
            <p>No recommendations returned.</p>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "30px",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f5f7fa",
    minHeight: "100vh",
  },
  title: {
    marginBottom: "20px",
    color: "#1f3349",
  },
  card: {
    background: "#ffffff",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    marginBottom: "20px",
  },
  buttonRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },
  button: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#1f2937",
    color: "#ffffff",
    cursor: "pointer",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
  },
  textarea: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    resize: "vertical",
  },
  message: {
    marginTop: "8px",
    color: "#374151",
  },
  subtext: {
    marginTop: "0",
    marginBottom: "12px",
    color: "#6b7280",
    fontSize: "14px",
  },
};