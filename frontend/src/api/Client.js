const API = "http://127.0.0.1:8000";

export async function getHealth() {
  const res = await fetch(`${API}/health`);
  return res.json();
}

export async function startSession(labName) {
  const res = await fetch(`${API}/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab_name: labName }),
  });
  return res.json();
}

export async function addFinding(data) {
  const res = await fetch(`${API}/findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getReport(sessionId) {
  const res = await fetch(`${API}/reports/${sessionId}`);
  return res.json();
}