import { styles } from "../styles/appStyles";

export default function LabLauncherCard({ sessionId, launchingLab, onLaunchLab }) {
  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>Lab Launcher</h2>
        <span style={styles.mutedText}>Training environment</span>
      </div>

      <button
        style={styles.primaryButton}
        onClick={onLaunchLab}
        disabled={!sessionId || launchingLab}
      >
        {launchingLab ? "Launching..." : "Launch Juice Shop Lab"}
      </button>
    </section>
  );
}