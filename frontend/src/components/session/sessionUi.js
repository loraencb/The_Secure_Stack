export function badgeClass(tone = "muted") {
  return `badge badge--${tone}`;
}

export function getFindingSeverityTone(severity) {
  if (severity === "High") {
    return "danger";
  }

  if (severity === "Low") {
    return "success";
  }

  return "warning";
}
