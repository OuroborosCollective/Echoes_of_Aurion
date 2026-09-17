export type ReplayStage =
  | "PRE_STATE"
  | "INPUT_ORDER"
  | "POST_STATE"
  | "RECEIPT"
  | "MOVEMENT"
  | "PLAYER_ACTION"
  | "RESOURCE"
  | "MOB_FSM"
  | "MOB_COMBAT";

export type ReplayVerdict =
  | {
      status: "MATCH";
      verdict: "MATCH";
      stagesVerified: number;
      tick?: number;
      preStateHash?: string;
      postStateHash?: string;
      receiptHash?: string;
      postState?: unknown;
    }
  | {
      status: "FIRST_DIVERGENCE";
      verdict: "FIRST_DIVERGENCE";
      stage: ReplayStage | string;
      expected: string;
      observed: string;
      tick?: number;
      expectedHash?: string;
      observedHash?: string;
      diffDetails?: string;
    }
  | {
      status: "UNPROVABLE";
      verdict: "UNPROVABLE";
      reason: string;
      tick?: number;
    };

export function isReplayMatch(verdict: ReplayVerdict): boolean {
  return verdict.status === "MATCH";
}
