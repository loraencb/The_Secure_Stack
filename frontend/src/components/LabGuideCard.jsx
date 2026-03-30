import { styles } from "../styles/appStyles";

export default function LabGuideCard({
  labSteps,
  labInfo,
  currentLabStep,
  completedSteps,
}) {
  if (!labSteps) return null;

  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>Lab Guide</h2>
        <span style={styles.mutedText}>Step-by-step instructions</span>
      </div>

      {labInfo?.browser_url && (
        <p style={styles.paragraph}>
          <strong>Browser URL:</strong> {labInfo.browser_url}
        </p>
      )}

      <div style={styles.feedbackStack}>
        {labSteps.map((step, index) => {
          const isCompleted = completedSteps.includes(index);
          const isActive = index === currentLabStep;
          const isLocked = index > currentLabStep;

          return (
            <div
              key={index}
              style={{
                ...styles.stepCard,
                borderColor: isCompleted ? "#16a34a" : isActive ? "#2563eb" : "#e5e7eb",
                backgroundColor: isCompleted ? "#f0fdf4" : isActive ? "#eff6ff" : "#ffffff",
                opacity: isLocked ? 0.75 : 1,
              }}
            >
              <div style={styles.cardHeader}>
                <span style={styles.label}>
                  Step {index + 1}: {step.title}
                </span>

                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: isCompleted ? "#dcfce7" : isActive ? "#dbeafe" : "#e5e7eb",
                    color: isCompleted ? "#166534" : isActive ? "#1d4ed8" : "#374151",
                  }}
                >
                  {isCompleted ? "Completed" : isActive ? "Current" : "Pending"}
                </span>
              </div>

              <p style={styles.paragraph}>{step.instruction}</p>
              <code style={styles.commandChip}>{step.command_hint}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}