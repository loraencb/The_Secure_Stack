import { useEffect, useState } from "react";
import { getHealth } from "../api/Client";

export default function Dashboard() {
  const [status, setStatus] = useState("Checking platform status...");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getHealth();
        setStatus(data.status ?? JSON.stringify(data));
      } catch (e) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>

      <h2>Platform Status</h2>
      {error ? (
        <p style={{ color: "red" }}>Error: {error}</p>
      ) : (
        <p>{status}</p>
      )}
    </div>
  );
}
