import { styles } from "../styles/appStyles";

export default function SessionStatusCard({
  sessionId,
  findingsCount,
  hasLiveFeedback,
  labName,
}) {
  return (
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
          <span style={styles.metaValue}>{labName}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Session ID</span>
          <span style={styles.metaValue}>{sessionId ?? "None"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Findings</span>
          <span style={styles.metaValue}>{findingsCount}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>AI Feedback</span>
          <span style={styles.metaValue}>{hasLiveFeedback ? "Live" : "Waiting"}</span>
        </div>
      </div>
    </section>
  );
}