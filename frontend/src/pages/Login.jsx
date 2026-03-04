import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 24 }}>
      <h1>Login</h1>
      <p>Placeholder Login page.</p>

      <button onClick={() => navigate("/dashboard")}>
        Continue (temp)
      </button>
    </div>
  );
}