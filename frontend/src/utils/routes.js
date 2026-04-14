export function buildSessionPath(sessionId, section = "workspace") {
  if (!sessionId) {
    return "/labs";
  }

  return `/session/${sessionId}/${section}`;
}
