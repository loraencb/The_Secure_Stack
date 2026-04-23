export const LAB_CATALOG = [
  {
    labId: "juice-shop-recon",
    sessionLabName: "juice-shop",
    name: "Juice Shop Recon",
    description:
      "Guide learners through reconnaissance and validation steps against the Juice Shop target.",
    difficulty: "Intermediate",
    category: "Web Security",
    estimatedDurationMinutes: 45,
  },
  {
    labId: "http-service-mapping",
    sessionLabName: "http-service-mapping",
    name: "HTTP Service Mapping",
    description:
      "Guide learners through service enumeration, header analysis, and browser validation against an exposed Nginx target.",
    difficulty: "Beginner",
    category: "Service Enumeration",
    estimatedDurationMinutes: 30,
  },
];

export const DEFAULT_LAB_ID = LAB_CATALOG[0]?.labId ?? "juice-shop-recon";

export function getLabCatalogEntry(labId) {
  return LAB_CATALOG.find((lab) => lab.labId === labId) || LAB_CATALOG[0];
}
