function normalizeBaseUrl(value, fallback) {
  return (value || fallback).replace(/\/+$/, "");
}

function getDefaultApiBaseUrl() {
  return "/api";
}

function getDefaultWebSocketBaseUrl(apiBaseUrl) {
  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return apiBaseUrl.replace(/^http/, "ws");
  }

  return "/ws";
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_URL,
  getDefaultApiBaseUrl()
);
export const WS_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_WS_URL,
  getDefaultWebSocketBaseUrl(API_BASE_URL)
);
const AUTH_STORAGE_KEY = "securestack_auth_token";

export function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function buildWebSocketUrl(path) {
  if (WS_BASE_URL.startsWith("ws://") || WS_BASE_URL.startsWith("wss://")) {
    return `${WS_BASE_URL}${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${WS_BASE_URL}${path}`;
}

export function getAuthToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) || "";
}

export function setAuthToken(token) {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function clearAuthToken() {
  setAuthToken("");
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const authToken = getAuthToken();

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  return fetch(buildApiUrl(path), {
    ...options,
    headers,
  });
}

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      getAuthToken()
    ) {
      window.dispatchEvent(new CustomEvent("securestack:unauthorized"));
    }

    throw new Error(data?.detail || data?.error || "Request failed.");
  }

  return data;
}

export async function getHealth() {
  const res = await apiFetch("/health");
  return parseJsonResponse(res);
}

export async function startSession(labName, labId) {
  const res = await apiFetch("/sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lab_name: labName, lab_id: labId || null }),
  });
  return parseJsonResponse(res);
}

export async function getSession(sessionId) {
  const res = await apiFetch(`/sessions/${sessionId}`);
  return parseJsonResponse(res);
}

export async function getSessionHistory() {
  const res = await apiFetch("/sessions/history");
  return parseJsonResponse(res);
}

export async function launchLab(sessionId, labId) {
  const res = await apiFetch(`/labs/launch/${sessionId}/${labId}`, {
    method: "POST",
  });
  return parseJsonResponse(res);
}

export async function getLabDefinition(labId) {
  const res = await apiFetch(`/labs/definition/${labId}`);
  return parseJsonResponse(res);
}

export async function getTaskProgress(sessionId) {
  const res = await apiFetch(`/task-progress/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function completeTaskProgress(data) {
  const res = await apiFetch("/task-progress/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function attachTaskEvidence(sessionId, labId, taskId, data) {
  const res = await apiFetch(
    `/task-progress/session/${sessionId}/${labId}/${taskId}/evidence`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  return parseJsonResponse(res);
}

export async function addFinding(data) {
  const res = await apiFetch("/findings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res);
}

export async function getFindings(sessionId) {
  const res = await apiFetch(`/findings/session/${sessionId}`);
  return parseJsonResponse(res);
}

export async function getReport(sessionId) {
  const res = await apiFetch(`/reports/${sessionId}`);
  return parseJsonResponse(res);
}

export async function registerUser(payload) {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function loginUser(payload) {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function getCurrentUser() {
  const res = await apiFetch("/auth/me");
  return parseJsonResponse(res);
}

export async function logoutUser() {
  const res = await apiFetch("/auth/logout", {
    method: "POST",
  });
  return parseJsonResponse(res);
}
