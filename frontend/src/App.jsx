import { useEffect, useState } from "react";
import { getHealth } from "./api/client";

export default function App() {
  const [status, setStatus] = useState("Checking backend...");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getHealth();
        setStatus(data.status ?? JSON.stringify(data));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "Arial" }}>
      <h1>Secure Stack</h1>

      <h2>Backend Status</h2>

      {error ? (
        <p style={{ color: "red" }}>Error: {error}</p>
      ) : (
        <p>{status}</p>
      )}
    </div>
  );
}