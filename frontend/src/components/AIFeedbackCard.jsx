import { styles } from "../styles/appStyles";

export default function AIFeedbackCard({
  terminalFeedback,
  clearFeedback,
  assessmentColor,
}) {
  return (
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
                backgroundColor: assessmentColor[terminalFeedback.assessment] || "#111827",
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
              {terminalFeedback.security_relevance || "No security relevance available."}
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
  );
}