import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getHealth } from "./api/client";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function Home() {
  const [status, setStatus] = useState("Checking backend...");
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

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/login">Login</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}