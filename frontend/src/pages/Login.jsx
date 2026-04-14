import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DEFAULT_FORM = {
  email: "",
  password: "",
  displayName: "",
};

export default function Login() {
  const navigate = useNavigate();
  const { authLoading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login");
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "register") {
        await signUp({
          email: formState.email.trim(),
          password: formState.password,
          display_name: formState.displayName.trim() || null,
        });
      } else {
        await signIn({
          email: formState.email.trim(),
          password: formState.password,
        });
      }

      navigate("/", { replace: true });
    } catch (submitError) {
      console.error("Authentication error:", submitError);
      setError(submitError.message || "Authentication failed.");
    }
  }

  return (
    <div className="page-stack auth-page">
      <section className="page-header page-header--single auth-header">
        <div>
          <span className="eyebrow">Secure Stack Access</span>
          <h1>Sign in to continue your investigations.</h1>
          <p>
            Authentication now protects session ownership, findings, reports,
            and the investigation timeline so each learner only sees their own
            work.
          </p>
        </div>
      </section>

      <section className="surface-card auth-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Authentication</span>
            <h2>{mode === "login" ? "Sign In" : "Create Account"}</h2>
          </div>
          <div className="inline-actions auth-toggle">
            <button
              type="button"
              className={
                mode === "login"
                  ? "button button--secondary"
                  : "button button--ghost"
              }
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={
                mode === "register"
                  ? "button button--secondary"
                  : "button button--ghost"
              }
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>
        </div>

        <p className="section-lead">
          {mode === "login"
            ? "Use your Secure Stack account to reopen prior investigations and continue guided labs."
            : "Create a learner account so sessions, findings, and reports stay tied to you."}
        </p>

        <form className="form-grid auth-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <input
              type="text"
              name="displayName"
              placeholder="Display name"
              value={formState.displayName}
              onChange={updateField}
              className="field"
            />
          ) : null}

          <input
            type="email"
            name="email"
            placeholder="Email address"
            value={formState.email}
            onChange={updateField}
            className="field"
            autoComplete="email"
          />

          <input
            type="password"
            name="password"
            placeholder={
              mode === "register"
                ? "Password (minimum 8 characters)"
                : "Password"
            }
            value={formState.password}
            onChange={updateField}
            className="field"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />

          {error ? (
            <div className="callout callout--warning">
              <strong>Authentication issue:</strong> {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="button button--primary"
            disabled={authLoading}
          >
            {authLoading
              ? mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>
      </section>
    </div>
  );
}
