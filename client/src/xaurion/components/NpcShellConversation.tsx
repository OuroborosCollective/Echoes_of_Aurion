import React, { useEffect, useState } from "react";
import { soundSynth } from "../audio/SoundSynthesizer";
import { findNearestNpcShell, type NpcShellTarget } from "../integration/NpcShellProjection";
import type { MMOEngine } from "../core/MMOEngine";

const POLL_MS = 400;

function nearestWithPurpose(engine: Pick<MMOEngine, "scene" | "player"> | null | undefined): NpcShellTarget | null {
  const position = engine?.player?.position;
  if (!engine?.scene || !position) return null;
  // The nearest NPC with a confirmed purpose: an unconfirmed shell nearby never hides it.
  return findNearestNpcShell(engine.scene, { x: position.x, z: position.z }, undefined, shell => Boolean(shell.purpose));
}

/**
 * Talking to an NPC whose purpose the admin confirmed: greeting and topics exactly as
 * confirmed and receipted, identical for every player. No LLM is involved at runtime.
 */
export function NpcShellConversation({ engineRef }: Readonly<{ engineRef: React.RefObject<MMOEngine | null> }>) {
  const [nearby, setNearby] = useState<NpcShellTarget | null>(null);
  const [open, setOpen] = useState<NpcShellTarget | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  useEffect(() => {
    const poll = () => setNearby(nearestWithPurpose(engineRef.current));
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [engineRef]);

  // Walking away or a changed purpose ends the conversation.
  useEffect(() => {
    if (open && (nearby?.shellRef !== open.shellRef || nearby.purpose?.purposeHash !== open.purpose?.purposeHash)) { setOpen(null); setTopic(null); }
  }, [nearby, open]);

  if (!open) {
    if (!nearby?.purpose) return null;
    return (
      <button type="button" data-testid="npc-shell-talk-prompt" className="ax1-npc-prompt" aria-label={`Mit ${nearby.purpose.displayName} sprechen`}
        onClick={() => { soundSynth.playUiOpen(); setOpen(nearby); setTopic(null); }}>
        Mit {nearby.purpose.displayName} sprechen
      </button>
    );
  }
  const purpose = open.purpose!;
  const line = purpose.topics.find(item => item.topic === topic)?.line ?? null;
  return (
    <section data-testid="npc-shell-conversation" role="dialog" aria-label={`Gespräch mit ${purpose.displayName}`}
      className="fixed bottom-[168px] left-1/2 z-[1002] max-h-[calc(100dvh-200px)] w-[min(92vw,30rem)] -translate-x-1/2 space-y-3 overflow-y-auto rounded-xl border border-amber-400/40 bg-black/85 p-4 text-sm text-amber-50 shadow-2xl backdrop-blur">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-base font-bold text-amber-300">{purpose.displayName}</h2>
          <p className="text-xs text-gray-300">{purpose.role}</p>
        </div>
        <button type="button" onClick={() => { soundSynth.playUiClose(); setOpen(null); setTopic(null); }} className="min-h-11 min-w-11 rounded-lg border border-white/20 px-3 text-xs" aria-label="Gespräch beenden">Tschüss</button>
      </header>
      <p className="italic" data-testid="npc-shell-line">„{line ?? purpose.greeting}“</p>
      <div className="grid grid-cols-2 gap-2">
        {purpose.topics.map(item => (
          <button key={item.topic} type="button" onClick={() => { soundSynth.playUiClick(); setTopic(item.topic); }}
            aria-pressed={topic === item.topic}
            className={`min-h-11 rounded-lg border px-2 text-xs ${topic === item.topic ? "border-amber-300 bg-amber-900/40" : "border-white/20"}`}>
            {item.topic}
          </button>
        ))}
      </div>
    </section>
  );
}
