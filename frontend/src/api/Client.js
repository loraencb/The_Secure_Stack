const API = "http://127.0.0.1:8000";

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Request failed");
  }

  return data;
}

export async function getHealth() {
  const res = await fetch(`${API}/health`);
  return handleResponse(res);
}

export async function startSession(labName) {
  const res = await fetch(`${API}/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab_name: labName }),
  });

  return handleResponse(res);
}

export async function getSession(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}`);
  return handleResponse(res);
}

export async function listSessions() {
  const res = await fetch(`${API}/sessions`);
  return handleResponse(res);
}

export async function addFinding(data) {
  const res = await fetch(`${API}/findings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return handleResponse(res);
}

export async function getFindings(sessionId) {
  const res = await fetch(`${API}/findings/session/${sessionId}`);
  return handleResponse(res);
}

export async function launchLab(sessionId, labId) {
  const res = await fetch(`${API}/labs/launch/${sessionId}/${labId}`, {
    method: "POST",
  });

  return handleResponse(res);
}

export async function stopLab(sessionId) {
  const res = await fetch(`${API}/labs/stop/${sessionId}`, {
    method: "POST",
  });

  return handleResponse(res);
}

export async function getLabStatus(sessionId) {
  const res = await fetch(`${API}/labs/status/${sessionId}`);
  return handleResponse(res);
}

export async function getReport(sessionId) {
  const res = await fetch(`${API}/reports/${sessionId}`);
  return handleResponse(res);
}