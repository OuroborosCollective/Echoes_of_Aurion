import { applyCompanionIntent, createCompanionSession, type CompanionSession } from "@shared/companionLearningProtocol";
import { loadCompanionSession, transitionCompanionSession } from "./companionLearning";

const COUNTER_KEY = "echoes-of-aurion.native-research-counter.v1";
export const NATIVE_RESEARCH_LABEL = "Aurion Research Recorder";

function save(session: CompanionSession): CompanionSession {
  localStorage.setItem("echoes-of-aurion.companion-session.v1", JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("aurion:companion-state", { detail: session }));
  return session;
}

export function startNativeResearchRecording(userId: number): CompanionSession {
  if (!Number.isInteger(userId) || userId < 1) throw new Error("AUTHENTICATED_USER_REQUIRED");
  const raw = Number.parseInt(localStorage.getItem(COUNTER_KEY) ?? "0", 10);
  const counter = Number.isSafeInteger(raw) && raw >= 0 ? raw + 1 : 1;
  localStorage.setItem(COUNTER_KEY, String(counter));
  const base = createCompanionSession({
    sessionId: `cmp_native_${userId}_${counter}`,
    userId,
    llmLabel: NATIVE_RESEARCH_LABEL,
  });
  return save(applyCompanionIntent(applyCompanionIntent(base, "connect"), "learn"));
}

export function stopNativeResearchRecording(): CompanionSession | null {
  let current = loadCompanionSession();
  if (!current || current.llmLabel !== NATIVE_RESEARCH_LABEL) return current;
  if (current.mode === "learning") current = transitionCompanionSession("finish_learning");
  if (current.mode === "ready" || current.mode === "connected") current = transitionCompanionSession("stop");
  if (current.mode === "stopping") current = transitionCompanionSession("disconnect");
  return current;
}
