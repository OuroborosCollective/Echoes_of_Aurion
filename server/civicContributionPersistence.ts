import { createHash } from "node:crypto";
import { domainSha256 } from "../shared/aurionCanonicalHash";
import {
  CivicContributionInput,
  CivicDonationReceipt,
  CivicProjectMilestone,
} from "../shared/civicContributionContract";

const INITIAL_CIVIC_PROJECTS: CivicProjectMilestone[] = [
  {
    projectId: "observatory_sanctuary",
    title: "Sanierung des Sternwarten-Schreins",
    description: "Kollektive Rekonstruktion der astral-optischen Reflektoren an der Zonengrenze.",
    regionId: "observatory_threshold",
    currentTier: 1,
    targetTier: 5,
    contributedUnits: 320,
    requiredUnits: 1000,
    progressPermille: 320,
    worldDesignPlacementKey: "landmark_observatory_sanctuary",
    status: "active",
  },
  {
    projectId: "windhollow_beacon",
    title: "Windhollow Resonanz-Leuchtfeuer",
    description: "Errichtung einer stabilisierenden Signalfackel gegen Kausalitätsstürme.",
    regionId: "windhollow",
    currentTier: 2,
    targetTier: 4,
    contributedUnits: 750,
    requiredUnits: 1000,
    progressPermille: 750,
    worldDesignPlacementKey: "landmark_windhollow_beacon",
    status: "active",
  },
  {
    projectId: "emberfall_forge",
    title: "Glutsturz Primordial-Esse",
    description: "Reaktivierung der geomagnetischen Schmelze zur Verfeinerung seltener Ausrüstung.",
    regionId: "emberfall",
    currentTier: 0,
    targetTier: 3,
    contributedUnits: 0,
    requiredUnits: 2500,
    progressPermille: 0,
    worldDesignPlacementKey: "landmark_emberfall_forge",
    status: "active",
  },
];

// In-memory state for runtime & tests
const civicProjectsStore = new Map<string, CivicProjectMilestone>(
  INITIAL_CIVIC_PROJECTS.map(p => [p.projectId, { ...p }])
);
const donationReceiptsStore: CivicDonationReceipt[] = [];

export async function listCivicProjects(regionId?: string): Promise<CivicProjectMilestone[]> {
  const all = Array.from(civicProjectsStore.values());
  if (!regionId) return all;
  return all.filter(p => p.regionId === regionId);
}

export async function recordCivicContribution(
  userId: number,
  input: CivicContributionInput
): Promise<{ receipt: CivicDonationReceipt; updatedMilestone: CivicProjectMilestone }> {
  const project = civicProjectsStore.get(input.projectId);
  if (!project) {
    throw new Error(`CIVIC_PROJECT_NOT_FOUND: ${input.projectId}`);
  }

  // Pure integer arithmetic - no floats, no clocks
  const newUnits = project.contributedUnits + input.units;
  const newProgressPermille = Math.min(1000, Math.trunc((newUnits * 1000) / project.requiredUnits));

  let newTier = project.currentTier;
  let status = project.status;
  if (newUnits >= project.requiredUnits) {
    newTier = Math.min(project.targetTier, project.currentTier + 1);
    if (newTier >= project.targetTier) {
      status = "completed";
    }
  }

  project.contributedUnits = newUnits;
  project.progressPermille = newProgressPermille;
  project.currentTier = newTier;
  project.status = status;

  const receiptId = `civic_rcpt_${createHash("sha256")
    .update(`${userId}:${input.projectId}:${input.logicalTick}:${input.sourceReceiptId}`)
    .digest("hex")
    .slice(0, 24)}`;

  const proofHash = domainSha256("aurion.civic.donation.receipt.v1", [
    receiptId,
    userId,
    input.projectId,
    input.units,
    input.logicalTick,
    input.sourceReceiptId,
  ]);

  const receipt: CivicDonationReceipt = {
    receiptId,
    userId,
    projectId: input.projectId,
    units: input.units,
    contributedAtTick: input.logicalTick,
    proofHash,
  };

  donationReceiptsStore.push(receipt);

  return {
    receipt,
    updatedMilestone: { ...project },
  };
}
