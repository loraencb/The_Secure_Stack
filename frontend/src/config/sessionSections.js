export const SESSION_SECTIONS = [
  {
    step: 1,
    slug: "overview",
    label: "Overview",
    phase: "Orient",
    description:
      "Start here to understand the lab objective, current setup, and next move before acting.",
  },
  {
    step: 2,
    slug: "guide",
    label: "Guide",
    phase: "Prepare",
    description:
      "Review the current task, hints, and expected evidence so you know what to validate next.",
  },
  {
    step: 3,
    slug: "workspace",
    label: "Workspace",
    phase: "Validate",
    description:
      "Run commands in the live environment, inspect output, and use the tutor to confirm progress.",
  },
  {
    step: 4,
    slug: "reports",
    label: "Reports",
    phase: "Review",
    description:
      "Capture the strongest findings, review the results, and turn session evidence into a report.",
  },
];

export const SESSION_STAGE_META = {
  current: { label: "Current section", tone: "info" },
  next: { label: "Recommended next", tone: "sky" },
  previous: { label: "Reviewed", tone: "muted" },
  upcoming: { label: "Ahead", tone: "muted" },
};

export function getSessionSection(sectionSlug) {
  return (
    SESSION_SECTIONS.find((section) => section.slug === sectionSlug) ||
    SESSION_SECTIONS[0]
  );
}

export function getSessionSectionIndex(sectionSlug) {
  return SESSION_SECTIONS.findIndex((section) => section.slug === sectionSlug);
}

export function getNextSessionSection(sectionSlug) {
  const sectionIndex = getSessionSectionIndex(sectionSlug);

  if (sectionIndex === -1 || sectionIndex >= SESSION_SECTIONS.length - 1) {
    return null;
  }

  return SESSION_SECTIONS[sectionIndex + 1];
}

export function getPreviousSessionSection(sectionSlug) {
  const sectionIndex = getSessionSectionIndex(sectionSlug);

  if (sectionIndex <= 0) {
    return null;
  }

  return SESSION_SECTIONS[sectionIndex - 1];
}

export function getSessionSectionFromPathname(pathname = "") {
  return (
    SESSION_SECTIONS.find((section) => pathname.endsWith(`/${section.slug}`)) ||
    SESSION_SECTIONS[0]
  );
}

export function getSessionSectionState(sectionSlug, currentSlug) {
  const sectionIndex = getSessionSectionIndex(sectionSlug);
  const currentIndex = getSessionSectionIndex(currentSlug);

  if (sectionIndex === currentIndex) {
    return "current";
  }

  if (sectionIndex === currentIndex + 1) {
    return "next";
  }

  if (sectionIndex < currentIndex) {
    return "previous";
  }

  return "upcoming";
}

export function getSessionJourneyPercent(sectionSlug) {
  const section = getSessionSection(sectionSlug);
  return Math.round((section.step / SESSION_SECTIONS.length) * 100);
}
