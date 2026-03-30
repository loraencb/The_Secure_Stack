import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = (e) => {
    e.preventDefault();

    // 🔥 TEMP LOGIN LOGIC (replace later with real auth)
    if (!form.username || !form.password) {
      setError("Please enter username and password.");
      return;
    }

    // simulate login success
    localStorage.setItem("user", form.username);

    navigate("/dashboard");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Secure Stack</h1>
        <p style={styles.subtitle}>AI Cybersecurity Training Platform</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={form.username}
            onChange={handleChange}
            style={styles.input}
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button}>
            Login
          </button>
        </form>

        <button
          style={styles.secondaryButton}
          onClick={() => navigate("/dashboard")}
        >
          Skip (Demo Mode)
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f6fb",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: 320,
    padding: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
  },
  button: {
    padding: 10,
    borderRadius: 8,
    border: "none",
    backgroundColor: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
  secondaryButton: {
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#fff",
    cursor: "pointer",
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
  },
};