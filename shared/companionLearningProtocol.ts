export const COMPANION_PROTOCOL_VERSION = "aurion-companion-learning.v1" as const;
export const COMPANION_FEATURE_VECTOR_LENGTH = 16 as const;
export const COMPANION_STATE_VECTOR_LENGTH = 6 as const;
export const COMPANION_FRAME_MAX_AGE_MS = 1_250 as const;

export type CompanionMode = "disconnected" | "connected" | "learning" | "ready" | "playing" | "stopping";
export type CompanionIntent = "connect" | "learn" | "finish_learning" | "play" | "stop" | "disconnect" | "user_offline";
export type CompanionCommandOrigin = "gateway" | "human_team" | "local_console";

export type CompanionSession = {
  protocol: typeof COMPANION_PROTOCOL_VERSION;
  sessionId: string;
  userId: number;
  llmLabel: string;
  mode: CompanionMode;
  online: boolean;
  datasetRows: number;
  notes: number;
  companionSpawned: boolean;
  revision: number;
};

export type CompanionTransition = {
  from: CompanionMode;
  intent: CompanionIntent;
  to: CompanionMode;
};

const transitions: readonly CompanionTransition[] = [
  { from: "disconnected", intent: "connect", to: "connected" },
  { from: "connected", intent: "learn", to: "learning" },
  { from: "learning", intent: "finish_learning", to: "ready" },
  { from: "ready", intent: "play", to: "playing" },
  { from: "playing", intent: "stop", to: "stopping" },
  { from: "playing", intent: "learn", to: "learning" },
  { from: "learning", intent: "stop", to: "stopping" },
  { from: "connected", intent: "stop", to: "stopping" },
  { from: "ready", intent: "stop", to: "stopping" },
  { from: "stopping", intent: "disconnect", to: "disconnected" },
  { from: "stopping", intent: "connect", to: "connected" },
  { from: "playing", intent: "user_offline", to: "stopping" },
  { from: "learning", intent: "user_offline", to: "stopping" },
  { from: "ready", intent: "user_offline", to: "stopping" },
  { from: "connected", intent: "user_offline", to: "stopping" },
];

export function transitionCompanion(mode: CompanionMode, intent: CompanionIntent): CompanionMode {
  const transition = transitions.find((candidate) => candidate.from === mode && candidate.intent === intent);
  if (!transition) throw new Error(`Ungültiger Companion-Übergang: ${mode} + ${intent}`);
  return transition.to;
}

export function companionCanAct(session: Pick<CompanionSession, "mode" | "online" | "companionSpawned">): boolean {
  return session.mode === "playing" && session.online && session.companionSpawned;
}

/** Only commands originating from the paired MCP gateway require the learned companion to be spawned. */
export function companionCommandRequiresSpawn(origin: CompanionCommandOrigin): boolean {
  return origin === "gateway";
}

/** Human team and local-console actions remain human-authorized in gameplay receipts. */
export function companionGameplayActionSource(origin: CompanionCommandOrigin): "human" | "gateway" {
  return origin === "gateway" ? "gateway" : "human";
}

export function applyCompanionIntent(session: CompanionSession, intent: CompanionIntent): CompanionSession {
  const mode = transitionCompanion(session.mode, intent);
  const stopping = mode === "stopping" || mode === "disconnected";
  const spawning = mode === "playing";
  return {
    ...session,
    mode,
    online: intent === "user_offline" ? false : session.online,
    companionSpawned: spawning && !stopping,
    revision: session.revision + 1,
  };
}

export function assertCompanionInvariants(session: CompanionSession): void {
  if (session.protocol !== COMPANION_PROTOCOL_VERSION) throw new Error("Companion-Protokollversion unbekannt");
  if (!Number.isInteger(session.userId) || session.userId < 1) throw new Error("Companion userId ist ungültig");
  if (!session.sessionId.trim() || !session.llmLabel.trim()) throw new Error("Companion-Identität fehlt");
  if (session.mode === "playing" && (!session.online || !session.companionSpawned)) throw new Error("Playing erfordert Online-Präsenz und Spawn");
  if (session.mode !== "playing" && session.companionSpawned) throw new Error("Companion darf außerhalb von Playing nicht gespawnt sein");
  if (session.datasetRows < 0 || session.notes < 0 || session.revision < 0) throw new Error("Companion-Zähler ungültig");
}

export function createCompanionSession(input: Pick<CompanionSession, "sessionId" | "userId" | "llmLabel">): CompanionSession {
  const session: CompanionSession = {
    protocol: COMPANION_PROTOCOL_VERSION,
    ...input,
    mode: "disconnected",
    online: true,
    datasetRows: 0,
    notes: 0,
    companionSpawned: false,
    revision: 0,
  };
  assertCompanionInvariants(session);
  return session;
}
