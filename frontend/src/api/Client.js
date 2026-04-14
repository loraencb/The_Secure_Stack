const API = "http://127.0.0.1:8000";

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || "Request failed.");
  }

  return data;
}

export async function getHealth() {
  const res = await fetch(`${API}/health`);
  return parseJsonResponse(res);
}

export async function startSession(labName) {
  const res = await fetch(`${API}/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab_name: labName }),
  });
  return parseJsonResponse(res);
}

export async function launchLab(sessionId, labId) {
  const res = await fetch(`${API}/labs/launch/${sessionId}/${labId}`, {
    method: "POST",
  });
  return parseJsonResponse(res);
}

export async function getLabDefinition(labId) {
  const res = await fetch(`${API}/labs/definition/${labId}`);
  return parseJsonResponse(res);
}

export async function getTaskProgress(sessionId) {
  const res = await fetch(`${API}/task-progress/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function completeTaskProgress(data) {
  const res = await fetch(`${API}/task-progress/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function attachTaskEvidence(sessionId, labId, taskId, data) {
  const res = await fetch(
    `${API}/task-progress/session/${sessionId}/${labId}/${taskId}/evidence`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  return parseJsonResponse(res);
}

export async function addFinding(data) {
  const res = await fetch(`${API}/findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function getFindings(sessionId) {
  const res = await fetch(`${API}/findings/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function getReport(sessionId) {
  const res = await fetch(`${API}/reports/${sessionId}`);
  return parseJsonResponse(res);
}
