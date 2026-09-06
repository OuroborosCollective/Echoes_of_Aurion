import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { operationalNow } from "@shared/operationalClock";
import type { CompanionSession } from "@shared/companionLearningProtocol";
import {
  companionDatasetCount,
  loadCompanionSession,
  recordCompanionObservation,
  startCompanionSession,
  transitionCompanionSession,
} from "@/lib/companionLearning";
import {
  WORLD_DEMONSTRATION_EVENT,
  actionFromWorldIntent,
  queueHumanDemonstration,
  type PendingHumanDemonstration,
} from "@/lib/companionWorldInputs";
import { requestCompanionFrame } from "@/lib/companionFrameCapture";
import { useCompanionCaptureLoop } from "@/hooks/useCompanionCaptureLoop";

const PROVIDERS = ["ChatGPT", "Claude", "Gemini", "Mistral", "Lokales LLM", "Eigener MCP-Client"] as const;
type GatewayPairing = Readonly<{ sessionId: string; pairingToken: string; mcpUrl: string; allowedCommands: string[] }>;
const UNKNOWN_STATE = [0, 0, 0, 0, 0, 0] as const;
const UNKNOWN_MASK = [0, 0, 0, 0, 0, 0] as const;

/**
 * AX1-owned companion UI/capture. Aurion persists the resulting gateway and
 * memory rows only; it does not create movement, combat, quest or skill state.
 */
export default function Ax1CompanionOverlay() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>(PROVIDERS[0]);
  const [pairing, setPairing] = useState<GatewayPairing | null>(null);
  const [session, setSession] = useState<CompanionSession | null>(() => loadCompanionSession());
  const [rows, setRows] = useState(() => companionDatasetCount());
  const [message, setMessage] = useState("");
  const pending = useRef<PendingHumanDemonstration>();
  const nextPendingId = useRef(0);
  const createGatewaySession = trpc.gateway.createSession.useMutation();
  const revokeGatewaySession = trpc.gateway.revokeSession.useMutation();
  const persistObservation = trpc.companion.persistObservation.useMutation();

  useEffect(() => {
    const show = () => { setMessage(""); setOpen(true); };
    const state = (event: Event) => setSession((event as CustomEvent<CompanionSession>).detail);
    const dataset = () => setRows(companionDatasetCount());
    const offline = () => {
      const current = loadCompanionSession();
      if (!current || current.mode === "disconnected" || current.mode === "stopping") return;
      try { setSession(transitionCompanionSession("user_offline")); } catch { /* fail closed */ }
    };
    window.addEventListener("aurion:open-companion", show);
    window.addEventListener("aurion:companion-state", state);
    window.addEventListener("aurion:companion-dataset-updated", dataset);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("aurion:open-companion", show);
      window.removeEventListener("aurion:companion-state", state);
      window.removeEventListener("aurion:companion-dataset-updated", dataset);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    const observe = (event: Event) => {
      const current = loadCompanionSession();
      if (!current || current.mode !== "learning" || current.userId !== user?.id) return;
      const detail = (event as CustomEvent<unknown>).detail;
      const action = actionFromWorldIntent(detail);
      const movement = Boolean(detail && typeof detail === "object" && "kind" in detail && detail.kind === "move");
      if (action) {
        nextPendingId.current += 1;
        pending.current = queueHumanDemonstration(pending.current, action, operationalNow(), nextPendingId.current, movement ? "movement" : "action");
      } else if (movement && pending.current?.source === "movement") {
        pending.current = undefined;
      }
    };
    window.addEventListener(WORLD_DEMONSTRATION_EVENT, observe);
    return () => window.removeEventListener(WORLD_DEMONSTRATION_EVENT, observe);
  }, [user?.id]);

  useCompanionCaptureLoop({
    enabled: session?.mode === "learning",
    scope: `${user?.id ?? 0}:${session?.sessionId ?? "none"}:ax1-world`,
    pending,
    now: operationalNow,
    capture: requestCompanionFrame,
    accept: (sample, action) => {
      const row = recordCompanionObservation({
        frameDataUrl: sample.frameDataUrl,
        featureVector: [...sample.featureVector],
        action: action.action,
        stateVector: [...UNKNOWN_STATE],
        stateMask: [...UNKNOWN_MASK],
        capturedAt: sample.capturedAt,
        note: "Menschliche Eingabe im sichtbaren AX1-Welt-Canvas; unbekannte Zustandsfelder bleiben maskiert.",
      });
      if (!row) return false;
      void persistObservation.mutateAsync({
        sessionId: row.session_id,
        sequenceIndex: row.sequence_index,
        timestampEpoch: row.timestamp_epoch,
        sampleId: row.sample_id,
        featureVector: row.feature_vector,
        targetAction: row.target_action_chunk[0],
        stateVector: row.state_vector,
        stateMask: row.state_mask,
        note: row.note,
      }).catch(() => setMessage("Die lokale Demonstration ist gesichert; die Datenbankbestätigung steht noch aus."));
      return true;
    },
    onError: () => setMessage("Die sichtbare AX1-Aufzeichnung konnte nicht bestätigt werden; es wurde kein Ersatzsample erfunden."),
  });

  const pair = async () => {
    if (!isAuthenticated || !user?.id || createGatewaySession.isPending) return;
    setMessage("");
    try {
      // The gateway owns the canonical WASD command set. The UI does not mint one.
      const next = await createGatewaySession.mutateAsync({ providerLabel: provider });
      const compact: GatewayPairing = {
        sessionId: next.sessionId,
        pairingToken: next.pairingToken,
        mcpUrl: next.mcpUrl,
        allowedCommands: next.allowedCommands,
      };
      setPairing(compact);
      startCompanionSession(user.id, provider, next.sessionId);
      setSession(transitionCompanionSession("connect"));
    } catch {
      setMessage("Der Companion-Steuervertrag konnte nicht bestätigt werden.");
    }
  };

  const toggleLearning = () => {
    const current = loadCompanionSession();
    if (!current) { setMessage("Verbinde zuerst einen Companion."); return; }
    try {
      const next = transitionCompanionSession(current.mode === "learning" ? "finish_learning" : "learn");
      setSession(next);
      if (next.mode !== "learning") pending.current = undefined;
      if (next.mode === "learning") setOpen(false);
    } catch {
      setMessage("Der Companion-Zustand wurde verworfen, weil der Übergang nicht zulässig war.");
    }
  };

  const revoke = async () => {
    if (!pairing || revokeGatewaySession.isPending) return;
    try {
      await revokeGatewaySession.mutateAsync({ sessionId: pairing.sessionId });
      const current = loadCompanionSession();
      if (current && current.mode !== "disconnected" && current.mode !== "stopping") transitionCompanionSession("stop");
      if (loadCompanionSession()?.mode === "stopping") transitionCompanionSession("disconnect");
      setSession(loadCompanionSession());
      setPairing(null);
      pending.current = undefined;
      setOpen(false);
    } catch {
      setMessage("Die Companion-Verbindung konnte nicht bestätigt beendet werden.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop">
        <DialogTitle>Companion-Aufzeichnung</DialogTitle>
        <DialogDescription>AX1 zeichnet nur nach deiner Aktivierung sichtbare Spielbilder und deine tatsächlichen Eingaben auf. Aurion speichert ausschließlich bestätigte Metadaten und Samples.</DialogDescription>
        {!pairing ? (
          <>
            <label>MCP-Partner
              <select aria-label="MCP-Partner" value={provider} onChange={event => setProvider(event.target.value as (typeof PROVIDERS)[number])}>
                {PROVIDERS.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <button type="button" disabled={!isAuthenticated || createGatewaySession.isPending} onClick={() => void pair()}>Companion verbinden</button>
          </>
        ) : (
          <>
            <p>Steuervertrag: {session?.llmLabel ?? provider}</p>
            <p>{rows} lokale Beobachtungszeilen</p>
            <button type="button" disabled={!session} onClick={toggleLearning}>{session?.mode === "learning" ? "Aufzeichnung beenden" : "Aufzeichnung starten"}</button>
            <details>
              <summary>MCP-Verbindungsdaten</summary>
              <p>{pairing.mcpUrl}</p>
              <p>Der Pairing-Token wird nur in dieser expliziten Ansicht gezeigt.</p>
              <code className="aurion-authority-hud__hash">{pairing.pairingToken}</code>
            </details>
            <button type="button" onClick={() => void revoke()} disabled={revokeGatewaySession.isPending}>Verbindung beenden</button>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </DialogContent>
    </Dialog>
  );
}
