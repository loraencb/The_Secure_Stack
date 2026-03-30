import { useEffect, useState } from "react";
import { getHealth } from "../api/client";

export default function Dashboard() {
  const [status, setStatus] = useState("Checking backend...");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getHealth();
      setStatus(data.status ?? JSON.stringify(data));
    } catch (e) {
      setError(e?.message ?? "Failed to reach backend");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dashboard</h1>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Backend Status</h2>

          <button style={styles.refreshButton} onClick={fetchHealth}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p style={styles.muted}>Checking backend...</p>
        ) : error ? (
          <p style={styles.error}>Error: {error}</p>
        ) : (
          <p style={styles.success}>{status}</p>
        )}
      </section>
    </div>
  );
}

const styles = {
  container: {
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  title: {
    marginBottom: 20,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    backgroundColor: "#ffffff",
    maxWidth: 500,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    margin: 0,
  },
  refreshButton: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  },
  muted: {
    color: "#6b7280",
  },
  success: {
    color: "#16a34a",
    fontWeight: 600,
  },
  error: {
    color: "#dc2626",
    fontWeight: 600,
  },
};