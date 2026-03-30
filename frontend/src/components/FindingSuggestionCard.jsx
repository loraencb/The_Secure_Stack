import { styles } from "../styles/appStyles";

export default function FindingSuggestionCard({
  findingSuggestion,
  severityBadgeStyle,
  acceptingSuggestion,
  sessionId,
  onAcceptSuggestion,
  onDismissSuggestion,
}) {
  if (!findingSuggestion) return null;

  return (
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
            onClick={onAcceptSuggestion}
            disabled={!sessionId || acceptingSuggestion}
          >
            {acceptingSuggestion ? "Saving..." : "Accept Finding"}
          </button>

          <button
            style={styles.secondaryButton}
            onClick={onDismissSuggestion}
            disabled={acceptingSuggestion}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}