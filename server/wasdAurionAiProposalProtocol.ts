import { createHash } from "node:crypto";

/** Read-only, receipt-bound Aurion adaptation of Wasd's AI proposal semantics. */
export type AiProposalMode = "npc" | "swarm" | "diagnostic" | "deterministic";
export type AiProposalIntent = "selfheal_recovery" | "combat_decision" | "trade_decision" | "quest_dialogue" | "diagnostic_check" | "npc_behavior" | "swarm_consensus" | "general_reasoning";
export type AiProposal = { state: "proposal" | "health_notice" | "rejected"; intent: AiProposalIntent; commandType?: string; confidence: number; facts: readonly string[]; risks: readonly string[]; receiptHash: string };

const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const classifyIntent = (text: string, mode: AiProposalMode): AiProposalIntent => {
  if (/heal|recovery|degraded|reparier|heil/.test(text)) return "selfheal_recovery";
  if (/attack|combat|damage|angriff|kampf|schaden/.test(text)) return "combat_decision";
  if (/trade|merchant|shop|market|handel|markt/.test(text)) return "trade_decision";
  if (/quest|dialog|dialogue|auftrag|gespräch/.test(text)) return "quest_dialogue";
  if (/watchdog|diagnose|error|fehler/.test(text)) return "diagnostic_check";
  if (mode === "npc") return "npc_behavior";
  if (mode === "swarm") return "swarm_consensus";
  return "general_reasoning";
};
const commandFor = (intent: AiProposalIntent, mode: AiProposalMode) => {
  if (intent === "combat_decision") return "AURION_COMBAT_PROPOSAL";
  if (intent === "trade_decision") return "AURION_TRADE_PROPOSAL";
  if (intent === "quest_dialogue") return "AURION_DIALOGUE_PROPOSAL";
  if (intent === "swarm_consensus") return "AURION_SWARM_CONSENSUS";
  if (intent === "diagnostic_check") return "AURION_DIAGNOSTIC_PROPOSAL";
  return `AURION_${mode.toUpperCase()}_PROPOSAL`;
};

export function resolveAiProposal(input: { text: string; mode: AiProposalMode; receiptId: string; resolutionIndex: number }): AiProposal {
  if (!input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("AI proposal requires confirmed receipt and resolution index");
  const normalized = input.text.trim().toLowerCase();
  const intent = classifyIntent(normalized, input.mode);
  const risks = [
    ["mutation", "mutation-risk"], ["random", "randomness-risk"], ["timeout", "timeout-risk"], ["fatal", "fatal-risk"], ["corrupt", "corruption-risk"], ["korrupt", "corruption-risk"],
  ].filter(([token]) => normalized.includes(token)).map(([, risk]) => risk);
  const facts = input.text.split(/[.!?\n]/g).map(part => part.trim()).filter(Boolean).slice(0, 8);
  const confidence = Math.max(0.1, Math.min(0.99, Math.round((0.72 + (input.text.length > 20 ? 0.08 : 0) + (intent !== "general_reasoning" ? 0.12 : 0) - (risks.length > 0 ? 0.1 : 0)) * 100) / 100));
  const fatal = risks.includes("fatal-risk") || risks.includes("corruption-risk");
  const state: AiProposal["state"] = fatal || intent === "selfheal_recovery" ? "health_notice" : input.mode === "diagnostic" ? "rejected" : "proposal";
  const commandType = state === "proposal" ? commandFor(intent, input.mode) : undefined;
  return { state, intent, commandType, confidence, facts, risks, receiptHash: hash(["wasd:ai-proposal:v1", input.receiptId, input.mode, String(input.resolutionIndex), normalized, state, intent, ...risks]) };
}
