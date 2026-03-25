import { useState } from "react";
import {
  startSession,
  addFinding,
  getReport,
} from "./api/client";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [report, setReport] = useState(null);

  const handleStartSession = async () => {
    const res = await startSession("juice-shop");
    setSessionId(res.id);
  };

  const handleAddFinding = async () => {
    if (!sessionId) return alert("Start a session first!");

    await addFinding({
      session_id: sessionId,
      title: "SQL Injection",
      severity: "High",
      description: "Login form vulnerable",
    });

    alert("Finding added");
  };

  const handleGenerateReport = async () => {
    const res = await getReport(sessionId);
    setReport(res);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🔐 Secure Stack Dashboard</h1>

      {/* Controls */}
      <div style={styles.card}>
        <h2>Session Controls</h2>
        <div style={styles.buttonRow}>
          <button style={styles.button} onClick={handleStartSession}>
            Start Session
          </button>
          <button style={styles.button} onClick={handleAddFinding}>
            Add Finding
          </button>
          <button style={styles.button} onClick={handleGenerateReport}>
            Generate Report
          </button>
        </div>
        {sessionId && <p>Active Session ID: {sessionId}</p>}
      </div>

      {/* Report Section */}
      {report && (
        <div style={styles.card}>
          <h2>📊 AI Analysis</h2>

          <p>
            <strong>Risk Level:</strong>{" "}
            <span
              style={{
                color:
                  report.analysis.risk_level === "High"
                    ? "red"
                    : report.analysis.risk_level === "Medium"
                    ? "orange"
                    : "green",
              }}
            >
              {report.analysis.risk_level}
            </span>
          </p>

          <p>{report.analysis.summary}</p>

          <h3>⚠ Key Issues</h3>
          <ul>
            {report.analysis.key_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>

          <h3>🛠 Recommendations</h3>
          <ul>
            {report.analysis.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "30px",
    fontFamily: "Arial",
    backgroundColor: "#f5f7fa",
    minHeight: "100vh",
  },
  title: {
    marginBottom: "20px",
  },
  card: {
    background: "white",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
    marginBottom: "20px",
  },
  buttonRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "10px",
  },
  button: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#1f2937",
    color: "white",
    cursor: "pointer",
  },
};