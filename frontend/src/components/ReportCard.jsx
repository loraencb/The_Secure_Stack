import { styles } from "../styles/appStyles";

export default function ReportCard({ report, riskColor }) {
  const summary = report?.summary ?? {};

  return (
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
                backgroundColor: riskColor?.[summary.risk_level] || "#111827",
              }}
            >
              {summary.risk_level ?? "Unknown"}
            </div>
          </div>

          <div>
            <span style={styles.label}>Summary</span>
            <p style={styles.paragraph}>
              {summary.summary || "No summary available."}
            </p>
          </div>

          <div>
            <span style={styles.label}>Key Issues</span>
            {Array.isArray(summary.key_issues) && summary.key_issues.length > 0 ? (
              <ul style={styles.list}>
                {summary.key_issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p style={styles.paragraph}>No key issues returned.</p>
            )}
          </div>

          <div>
            <span style={styles.label}>Recommendations</span>
            {Array.isArray(summary.recommendations) && summary.recommendations.length > 0 ? (
              <ul style={styles.list}>
                {summary.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
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
  );
}