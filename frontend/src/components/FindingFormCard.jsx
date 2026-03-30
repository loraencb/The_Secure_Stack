import { styles } from "../styles/appStyles";

export default function FindingFormCard({
  findingForm,
  savingFinding,
  sessionId,
  onChange,
  onSubmit,
}) {
  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>Add Finding</h2>
        <span style={styles.mutedText}>Capture vulnerabilities</span>
      </div>

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          type="text"
          name="title"
          placeholder="Finding title"
          value={findingForm.title}
          onChange={onChange}
          style={styles.input}
        />

        <select
          name="severity"
          value={findingForm.severity}
          onChange={onChange}
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
          onChange={onChange}
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
  );
}