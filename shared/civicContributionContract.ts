import { z } from "zod";

export interface CivicProjectMilestone {
  projectId: string;
  title: string;
  description: string;
  regionId: "observatory_threshold" | "windhollow" | "emberfall" | "cinder_vault";
  currentTier: number;
  targetTier: number;
  contributedUnits: number;
  requiredUnits: number;
  progressPermille: number; // 0..1000
  worldDesignPlacementKey: string;
  status: "active" | "completed" | "locked";
}

export interface CivicDonationReceipt {
  receiptId: string;
  userId: number;
  projectId: string;
  units: number;
  contributedAtTick: number;
  proofHash: string;
}

export const CivicContributionInputSchema = z.object({
  projectId: z.string().trim().min(3).max(64),
  units: z.number().int().min(1).max(10_000),
  logicalTick: z.number().int().min(0),
  sourceReceiptId: z.string().trim().min(8).max(128),
});
export type CivicContributionInput = z.infer<typeof CivicContributionInputSchema>;

export const CivicProjectsQuerySchema = z.object({
  regionId: z.enum(["observatory_threshold", "windhollow", "emberfall", "cinder_vault"]).optional(),
});
export type CivicProjectsQuery = z.infer<typeof CivicProjectsQuerySchema>;
