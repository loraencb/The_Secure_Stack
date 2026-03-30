import { styles } from "../styles/appStyles";

export default function FindingsListCard({ findings, severityBadgeStyle }) {
  return (
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
              <p style={styles.findingDescription}>{finding.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyState}>
          No findings yet. Add one to show report value during the demo.
        </div>
      )}
    </section>
  );
}