/**
 * Echoes of Aurion — Expedition console
 * Design philosophy: A vertical bronze-and-glass field device frames rather than
 * hides the isometric sky-city. Every LLM signal is visible, bounded and logged.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, ChevronRight, CircleDot, Copy,
  Compass, Cpu, Download, Gamepad2, LockKeyhole, Radio, ShieldCheck, Sparkles, Swords,
  UserRound, Volume2, VolumeX, X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import GameCanvas from "@/components/GameCanvas";
import { appendLedger, exportLedger, readLedger, resetLedger, type LedgerEntry } from "@/lib/ledger";
import { AurionSoundscape } from "@/lib/soundscape";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

type Screen = "gate" | "loadout" | "mission";
type Command = "W" | "A" | "S" | "D" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "victory" };
type GatewayPairing = { sessionId: string; pairingToken: string; mcpUrl: string; expiresAt: Date; allowedCommands: string[] };

const initialMission: MissionState = { arena: 0, arenaName: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", sentinelHp: 112, sentinelMaxHp: 112, explorerHp: 100, echoHp: 100, shield: false, marked: false, phase: "active" };
const abilityDeck = [
  { code: "1", name: "Prisma-Schritt", detail: "Impulsbewegung", group: "Bewegung" },
  { code: "2", name: "Echoschild", detail: "Schutzimpuls", group: "Schutz" },
  { code: "3", name: "Sternenfaden", detail: "Bindung verstärken", group: "Taktik" },
  { code: "4", name: "Kartenblick", detail: "Sichtlinie scannen", group: "Aufklärung" },
  { code: "5", name: "Ruinenschnitt", detail: "Präzisionsstoß", group: "Angriff" },
  { code: "6", name: "Aegis-Knoten", detail: "Team-Schutzfeld", group: "Schutz" },
  { code: "7", name: "Ankerwurf", detail: "Gegner binden", group: "Kontrolle" },
  { code: "8", name: "Sonnenbruch", detail: "Flächenstoß", group: "Angriff" },
  { code: "9", name: "Aurion-Resonanz", detail: "Ultimatives Echo", group: "Signatur" },
];
const providers = ["ChatGPT", "Claude", "Gemini", "Mistral", "Lokales LLM", "Eigener MCP-Client"];

function codeFromText(value: string): Command | null {
  const candidate = value.trim().toUpperCase();
  return /^[WASD1-9]$/.test(candidate) ? (candidate as Command) : null;
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [screen, setScreen] = useState<Screen>("gate");
  const [provider, setProvider] = useState(providers[0]);
  const [connected, setConnected] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [operatorName, setOperatorName] = useState("Mira Voss");
  const [commandText, setCommandText] = useState("");
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => readLedger());
  const [selectedSkills, setSelectedSkills] = useState(["1", "2", "9"]);
  const [lastSignal, setLastSignal] = useState("Warten auf die Partnerkopplung.");
  const [missionElapsed, setMissionElapsed] = useState(0);
  const [mission, setMission] = useState<MissionState>(initialMission);
  const [gatewayPairing, setGatewayPairing] = useState<GatewayPairing | null>(null);
  const [gatewaySequence, setGatewaySequence] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const expeditionAudio = useRef<HTMLAudioElement | null>(null);
  const soundscape = useRef<AurionSoundscape | null>(null);
  const musicResetTimer = useRef<number | null>(null);
  const createGatewaySession = trpc.gateway.createSession.useMutation();
  const revokeGatewaySession = trpc.gateway.revokeSession.useMutation();
  const gatewayCommands = trpc.gateway.pullCommands.useQuery(
    { sessionId: gatewayPairing?.sessionId ?? "unpaired_session", afterSequence: gatewaySequence },
    { enabled: Boolean(gatewayPairing) && screen === "mission", refetchInterval: 900 }
  );

  const skillNames = useMemo(() => abilityDeck.filter((ability) => selectedSkills.includes(ability.code)), [selectedSkills]);
  const allowedGatewayCommands = useMemo(() => ["W", "A", "S", "D", ...selectedSkills], [selectedSkills]);
  const shapeMusic = (kind: LedgerEntry["kind"] | "victory"): void => {
    const audio = expeditionAudio.current;
    if (!audio || !audioEnabled) return;
    if (musicResetTimer.current) window.clearTimeout(musicResetTimer.current);
    const level: Record<LedgerEntry["kind"] | "victory", number> = { system: 0.30, command: 0.36, combat: 0.50, connection: 0.42, warning: 0.22, victory: 0.46 };
    audio.volume = level[kind];
    audio.playbackRate = kind === "combat" ? 1.035 : kind === "warning" ? 0.96 : 1;
    musicResetTimer.current = window.setTimeout(() => { if (expeditionAudio.current) { expeditionAudio.current.volume = 0.34; expeditionAudio.current.playbackRate = 1; } }, kind === "combat" ? 1600 : 900);
  };

  useEffect(() => {
    document.title = "Echoes of Aurion – LLM Koop-Action-Abenteuer";
  }, []);

  useEffect(() => {
    const audio = new Audio("/manus-storage/aurion-expedition-theme_e8a8afea.mp3");
    audio.loop = true;
    audio.volume = 0.34;
    expeditionAudio.current = audio;
    return () => { audio.pause(); expeditionAudio.current = null; };
  }, []);

  useEffect(() => {
    const mixer = new AurionSoundscape();
    soundscape.current = mixer;
    return () => { mixer.dispose(); soundscape.current = null; };
  }, []);

  useEffect(() => {
    const onLedger = (event: Event) => setLedger((event as CustomEvent<LedgerEntry[]>).detail);
    const onGameEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: LedgerEntry["kind"]; detail: string }>).detail;
      setLastSignal(detail.detail);
      appendLedger({ kind: detail.kind ?? "system", title: "Sternwarte", detail: detail.detail });
      soundscape.current?.cue(detail.kind ?? "system");
      shapeMusic(detail.kind ?? "system");
    };
    const onMissionState = (event: Event) => { const next = (event as CustomEvent<MissionState>).detail; setMission(next); if (next.phase === "victory") shapeMusic("victory"); };
    window.addEventListener("aurion:ledger-updated", onLedger);
    window.addEventListener("aurion:game-event", onGameEvent);
    window.addEventListener("aurion:mission-state", onMissionState);
    return () => {
      window.removeEventListener("aurion:ledger-updated", onLedger);
      window.removeEventListener("aurion:game-event", onGameEvent);
      window.removeEventListener("aurion:mission-state", onMissionState);
    };
  }, []);

  useEffect(() => {
    if (screen !== "mission") return;
    const timer = window.setInterval(() => setMissionElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    const received = gatewayCommands.data?.filter((entry) => entry.sequence > gatewaySequence) ?? [];
    if (received.length === 0) return;
    received.forEach((entry) => {
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));
      appendLedger({ kind: "command", title: `Autorisierter MCP-Impuls ${entry.command}`, detail: `${gatewayPairing?.sessionId ?? "MCP"} bestätigte die Sequenz ${entry.sequence}.` });
    });
    const last = received[received.length - 1];
    setGatewaySequence(last.sequence);
    setLastSignal(`Autorisierter MCP-Partner: Impuls ${last.command} empfangen.`);
  }, [gatewayCommands.data, gatewayPairing?.sessionId, gatewaySequence]);

  const pairPartner = (): void => {
    if (isPairing) return;
    if (authLoading) { setLastSignal("Expeditionskonto wird geprüft. Bitte einen Moment warten."); return; }
    if (!isAuthenticated) { setLastSignal("Melde dich an, um einen autorisierten Partner-Slot auszustellen."); startLogin(); return; }
    setIsPairing(true); setLastSignal(`Autorisierter MCP-Slot für ${provider} wird ausgegeben.`);
    createGatewaySession.mutate({ providerLabel: provider, allowedCommands: allowedGatewayCommands }, {
      onSuccess: (pairing) => {
        setGatewayPairing(pairing); setGatewaySequence(0); setConnected(true); setIsPairing(false);
        appendLedger({ kind: "connection", title: "MCP-Partner-Siegel ausgestellt", detail: `${provider} erhält einen zeitlich begrenzten, sichtbaren Steuervertrag. Der Token bleibt nur in dieser Sitzung sichtbar.` });
        setLastSignal(`${provider} kann jetzt über den autorisierten MCP-Steuervertrag beitreten.`);
      },
      onError: () => { setIsPairing(false); setLastSignal("Partner-Siegel konnte nicht ausgestellt werden. Prüfe die Konto-Verbindung erneut."); },
    });
  };
  const revokePartner = (): void => {
    if (!gatewayPairing || revokeGatewaySession.isPending) return;
    revokeGatewaySession.mutate({ sessionId: gatewayPairing.sessionId }, {
      onSuccess: () => {
        appendLedger({ kind: "connection", title: "MCP-Partner-Siegel widerrufen", detail: "Der serverseitige Steuervertrag wurde beendet; der Pairing-Token ist nicht mehr verwendbar." });
        setGatewayPairing(null); setGatewaySequence(0); setConnected(false); setScreen("gate");
        setLastSignal("Partner-Siegel widerrufen. Eine neue Kopplung kann ausgestellt werden.");
      },
      onError: () => setLastSignal("Der Widerruf konnte nicht bestätigt werden. Bitte erneut versuchen."),
    });
  };
  const unlockLoadout = (): void => { if (!connected) return; setScreen("loadout"); appendLedger({ kind: "system", title: "Menü freigeschaltet", detail: "Charakter- und Partner-Loadout sind jetzt verfügbar." }); };
  const toggleSkill = (code: string): void => setSelectedSkills((current) => { if (current.includes(code)) return current.filter((skill) => skill !== code); if (current.length >= 3) return [...current.slice(1), code]; return [...current, code]; });
  const beginMission = (): void => {
    setScreen("mission"); setMissionElapsed(0); setMission(initialMission);
    soundscape.current?.unlock();
    if (audioEnabled) void expeditionAudio.current?.play().catch(() => setLastSignal("Die Expeditionmusik ist bereit; aktiviere sie über das Klangsymbol."));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("aurion:begin-expedition")), 120);
    appendLedger({ kind: "system", title: "Expedition eröffnet", detail: `${operatorName || "Unbenannter Explorer"} und ${provider} betreten die Sternwarte Aurion.` });
    setLastSignal("Die Sternwarte öffnet ihre Resonanzschleuse.");
  };
  const toggleAudio = (): void => {
    const audio = expeditionAudio.current;
    if (!audio) return;
    if (audioEnabled) { audio.pause(); setAudioEnabled(false); setLastSignal("Expeditionsmusik pausiert."); return; }
    void audio.play().then(() => { setAudioEnabled(true); setLastSignal("Expeditionsmusik aktiviert."); }).catch(() => setLastSignal("Der Browser blockiert Audio bis zur nächsten direkten Interaktion."));
  };
  const sendPartnerCommand = (raw?: string): void => {
    const code = codeFromText(raw ?? commandText);
    if (!code) { appendLedger({ kind: "warning", title: "Befehl verworfen", detail: "Erlaubt sind ausschließlich W, A, S, D und die Slots 1–9." }); setLastSignal("Ungültiger Steuerimpuls: erlaubt sind W, A, S, D, 1–9."); return; }
    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code } }));
    const ability = abilityDeck.find((item) => item.code === code);
    appendLedger({ kind: /^[1-9]$/.test(code) ? "combat" : "command", title: `Partner-Impuls ${code}`, detail: ability ? `${provider} aktiviert ${ability.name}.` : `${provider} erhält den Bewegungsbefehl ${code}.` });
    setLastSignal(ability ? `${provider}: ${ability.name} ausgelöst.` : `${provider}: Kurs ${code} bestätigt.`); setCommandText("");
  };
  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => { window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } })); };
  const sendHumanAction = (): void => { window.dispatchEvent(new CustomEvent("aurion:human-action")); setLastSignal("Explorer löst ein Speersignal aus."); };
  const downloadLedger = (): void => { const blob = new Blob([exportLedger()], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aurion-memory-ledger.json"; link.click(); URL.revokeObjectURL(url); };
  const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const bossPercent = Math.max(0, Math.min(100, (mission.sentinelHp / mission.sentinelMaxHp) * 100));

  return (
    <main className="aurion-app">
      <GameCanvas />
      <div className="atmosphere-vignette" aria-hidden="true" />
      <div className="ruin-constellation" aria-hidden="true"><span className="ruin-arch" /><span className="ruin-temple" /><span className="ruin-temple distant" /><span className="ruin-shard shard-one" /><span className="ruin-shard shard-two" /><span className="ruin-duo explorer" /><span className="ruin-duo scout" /><span className="ruin-thread" /></div>
      <header className="brand-bar"><div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i /><b /><i /></span><div><p className="brand-kicker">COOPERATIVE EXPEDITION // 01</p><h1>Echoes <span>of</span> Aurion</h1></div></div><div className="brand-status"><a href="/ops" className="mr-4 text-[10px] tracking-[.14em] text-cyan-100/75 hover:text-cyan-200">OPS</a><button type="button" className="audio-toggle header-audio" onClick={toggleAudio} aria-label={audioEnabled ? "Expeditionsmusik pausieren" : "Expeditionsmusik aktivieren"}>{audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}</button><span className={connected ? "signal-dot active" : "signal-dot"} /> {connected ? "Partner-Siegel aktiv" : "Zugang versiegelt"}</div></header>
      {screen === "gate" && (
        <section className="gate-panel" aria-labelledby="gate-title">
          <div className="gate-runes" aria-hidden="true">✦ &nbsp; ◌ &nbsp; ⟡</div><p className="eyebrow"><LockKeyhole size={14} /> KOOP-VERBINDUNG ERFORDERLICH</p>
          <h2 id="gate-title">Ein Signal.<br /><em>Zwei Willen.</em><br />Eine letzte Sternwarte.</h2>
          <p className="gate-copy">Aurion öffnet sich erst, wenn du deinen LLM-Partner sichtbar koppelst. Dein bevorzugter MCP-fähiger Client erhält dafür ausschließlich einen zeitlich begrenzten Steuervertrag – keine private Chat-App wird gelesen oder ferngesteuert.</p>
          <div className="duo-tableau" aria-label="Explorer und Echo Scout sind über ein Aurion-Siegel verbunden"><div className="duo-actor explorer-figure"><span className="actor-crown" /><span className="actor-body" /><small>EXPLORER</small></div><div className="split-seal" aria-hidden="true"><i /><b /><i /></div><div className="duo-actor scout-figure"><span className="actor-crown" /><span className="actor-body" /><small>ECHO SCOUT</small></div></div>
          <div className="gate-divider"><span /></div><div className="connection-form"><label><span>Wähle deinen Team-Partner</span><select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={connected}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className={connected ? "seal-button connected" : "seal-button"} onClick={pairPartner} disabled={isPairing || connected}>{connected ? <ShieldCheck size={18} /> : <Radio size={18} />}{isPairing ? "STEUERVERTRAG WIRD AUSGESTELLT" : connected ? "MCP-PARTNER-SIEGEL AKTIV" : "AUTORISIERTEN MCP-SLOT ERSTELLEN"}</button>{gatewayPairing && <div className="gateway-pairing"><div><span>DEIN MCP-ENDPUNKT</span><code>{gatewayPairing.mcpUrl}</code></div><div><span>BEARER-PAIRINGTOKEN // NUR JETZT SICHTBAR</span><code>{gatewayPairing.pairingToken}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(gatewayPairing.pairingToken); }}><Copy size={13} /> TOKEN KOPIEREN</button></div><small>Konfiguriere den Token ausschließlich als <b>Authorization: Bearer</b>-Header in deinem MCP-fähigen LLM-Client. Er gilt bis {gatewayPairing.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} und steuert nur {gatewayPairing.allowedCommands.join(" · ")}.</small><button type="button" className="revoke-pairing" onClick={revokePartner}>{revokeGatewaySession.isPending ? "WIDERRUF WIRD BESTÄTIGT" : "PARTNER-SIEGEL WIDERRUFEN"}</button></div>}{connected && <button type="button" className="continue-link" onClick={unlockLoadout}>Expeditionsteam zusammenstellen <ChevronRight size={18} /></button>}</div>
          <div className="privacy-note"><ShieldCheck size={16} /><span><b>Autorisierte Koopsitzung.</b> {user?.name ? `${user.name} stellt den Partner-Slot aus. ` : ""}Der Gateway speichert nur normalisierte Befehle, Reihenfolge und Spielwirkung – keine Chat-Inhalte oder Provider-Tokens.</span></div>
        </section>
      )}
      {screen === "loadout" && <section className="loadout-deck" aria-labelledby="loadout-title"><div className="loadout-heading"><p className="eyebrow"><Compass size={14} /> TEAMKONFIGURATION</p><h2 id="loadout-title">Setze den <em>Resonanzkurs.</em></h2><p>Rüste drei sichtbare Protokolle aus. Dein Partner erhält nur diese Slots im Expeditionsfeed.</p></div><div className="loadout-grid"><label className="operator-field"><span>EXPLORER-KENNUNG</span><input value={operatorName} maxLength={20} onChange={(event) => setOperatorName(event.target.value)} /><small>WASD oder Touch-Brücke steuern diese Figur.</small></label><div className="partner-card"><Bot size={22} /><div><span>AKTIVER ECHO SCOUT</span><strong>{provider}</strong><small>Autorisierter MCP-Vertrag · WASD + Slots</small></div><span className="signal-dot active" /></div></div><div className="skill-shelf">{abilityDeck.map((ability) => { const equipped = selectedSkills.includes(ability.code); return <button type="button" key={ability.code} onClick={() => toggleSkill(ability.code)} className={equipped ? "skill-card equipped" : "skill-card"}><kbd>{ability.code}</kbd><span><strong>{ability.name}</strong><small>{ability.detail}</small></span>{equipped && <ShieldCheck size={17} />}</button>; })}</div><footer className="loadout-footer"><div><p>PARTNER-DECK <b>{selectedSkills.length}/3</b></p><span>{skillNames.map((skill) => skill.name).join(" · ")}</span></div><button type="button" className="seal-button embark" onClick={beginMission}><Swords size={18} /> STERNWARTE BETRETEN</button></footer></section>}
      {screen === "mission" && <section className="mission-ui" aria-label="Expeditionsoberfläche"><div className="mission-objective"><span>ARENA {mission.arena + 1}/3 // {mission.arenaName}</span><b>{mission.phase === "victory" ? "Aurion ist stabilisiert" : mission.objective}</b><div className="objective-meter"><i style={{ width: `${bossPercent}%` }} /></div></div><div className="boss-readout"><CircleDot size={14} /><span>SENTINEL <b>{mission.sentinelHp}/{mission.sentinelMaxHp}</b></span><i className={mission.marked ? "marked" : ""} /></div><div className="party-strip human"><UserRound size={17} /><div><span>EXPLORER</span><b>{operatorName || "Unbenannt"}</b></div><strong>{mission.explorerHp}</strong></div><div className="party-strip echo"><Bot size={17} /><div><span>LLM-PARTNER // {provider}</span><b>Echo Scout</b></div><strong>{mission.echoHp}</strong></div><div className="combat-timer"><Activity size={14} /> {formatTime(missionElapsed)}</div><aside className="command-console"><div className="console-head"><div><span className="signal-dot active" /> LIVE COMMAND BRIDGE</div><button type="button" aria-label="Ledger exportieren" onClick={downloadLedger}><Download size={15} /></button></div><p className="console-status"><Cpu size={14} /> {lastSignal}</p><div className="command-input"><input aria-label="LLM-Befehl" value={commandText} onChange={(event) => setCommandText(event.target.value.slice(-1))} onKeyDown={(event) => { if (event.key === "Enter") sendPartnerCommand(); }} placeholder="W / A / S / D / 1–9" /><button type="button" onClick={() => sendPartnerCommand()}><ChevronRight size={18} /></button></div><div className="quick-commands">{["W", "A", "S", "D", ...selectedSkills].map((code) => <button type="button" key={code} onClick={() => sendPartnerCommand(code)}>{code}</button>)}</div><div className="ledger-list">{ledger.slice(-4).reverse().map((entry) => <div className={`ledger-row ${entry.kind}`} key={entry.id}><span>{entry.kind === "warning" ? <X size={13} /> : <Sparkles size={13} />}</span><p><b>{entry.title}</b><small>{entry.detail}</small></p></div>)}</div></aside><div className="player-control-bridge" aria-label="Touch-Steuerung für Explorer"><span>EXPLORER STEUERUNG</span><div className="dpad"><button type="button" onClick={() => sendHumanCommand("W")} aria-label="Vorwärts"><ArrowUp size={20} /></button><button type="button" onClick={() => sendHumanCommand("A")} aria-label="Links"><ArrowLeft size={20} /></button><button type="button" onClick={() => sendHumanCommand("S")} aria-label="Rückwärts"><ArrowDown size={20} /></button><button type="button" onClick={() => sendHumanCommand("D")} aria-label="Rechts"><ArrowRight size={20} /></button></div><button type="button" className="spear-action" onClick={sendHumanAction}><Swords size={15} /> SPEER // 17</button></div><div className="ability-rail"><span><Gamepad2 size={15} /> ECHO SLOTS</span>{skillNames.map((ability) => <button type="button" key={ability.code} onClick={() => sendPartnerCommand(ability.code)}><kbd>{ability.code}</kbd><small>{ability.name}</small></button>)}</div><div className="arena-track" aria-label="Fortschritt durch die Ruinenarenen">{["ASTERION", "ARCHIV", "SOLARIUM"].map((label, index) => <span key={label} className={index < mission.arena ? "cleared" : index === mission.arena ? "current" : ""}>{index + 1}<small>{label}</small></span>)}</div><button type="button" className="ledger-reset" onClick={() => { resetLedger(); setLastSignal("Lokales Ledger wurde geleert."); }}><X size={13} /> Ledger leeren</button></section>}
    </main>
  );
}
