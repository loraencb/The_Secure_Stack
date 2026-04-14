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
];

export const DEFAULT_LAB_ID = LAB_CATALOG[0]?.labId ?? "juice-shop-recon";

export function getLabCatalogEntry(labId) {
  return LAB_CATALOG.find((lab) => lab.labId === labId) || LAB_CATALOG[0];
}
