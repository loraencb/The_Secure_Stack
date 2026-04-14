export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || "Request failed.");
  }

  return data;
}

export async function getHealth() {
  const res = await fetch(`${API_BASE_URL}/health`);
  return parseJsonResponse(res);
}

export async function startSession(labName) {
  const res = await fetch(`${API_BASE_URL}/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab_name: labName }),
  });
  return parseJsonResponse(res);
}

export async function launchLab(sessionId, labId) {
  const res = await fetch(`${API_BASE_URL}/labs/launch/${sessionId}/${labId}`, {
    method: "POST",
  });
  return parseJsonResponse(res);
}

export async function getLabDefinition(labId) {
  const res = await fetch(`${API_BASE_URL}/labs/definition/${labId}`);
  return parseJsonResponse(res);
}

export async function getTaskProgress(sessionId) {
  const res = await fetch(`${API_BASE_URL}/task-progress/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function completeTaskProgress(data) {
  const res = await fetch(`${API_BASE_URL}/task-progress/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function attachTaskEvidence(sessionId, labId, taskId, data) {
  const res = await fetch(
    `${API_BASE_URL}/task-progress/session/${sessionId}/${labId}/${taskId}/evidence`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  return parseJsonResponse(res);
}

export async function addFinding(data) {
  const res = await fetch(`${API_BASE_URL}/findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function getFindings(sessionId) {
  const res = await fetch(`${API_BASE_URL}/findings/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function getReport(sessionId) {
  const res = await fetch(`${API_BASE_URL}/reports/${sessionId}`);
  return parseJsonResponse(res);
}
