import type { ReactNode } from "react";
import { Activity, BrainCircuit, Castle, Coins, Compass, Crown, Database, FlaskConical, Hammer, Languages, MapPin, ScrollText, Shield, Sparkles, Swords, Users } from "lucide-react";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import type { ConfirmedCombatMetrics } from "../integration/combatPresentation";
import { AX1_VISIBLE_SOURCE_REVISION } from "../integration/ax1SourceManifest";
import { Ax1ProjectionModal, type Ax1ProjectionState, UnknownValue } from "./Ax1ProjectionModal";

export type Ax1WorldPoi = Readonly<{ id: string; kind: "portal" | "npc" | "encounter" | "landmark"; state: "locked" | "available" | "completed"; label: string }>;
export type Ax1ConfirmedWorld = Readonly<{
  displayName: string;
  epoch: number;
  deterministicHash: string;
  pointsOfInterest: readonly Ax1WorldPoi[];
  primaryEncounter: Readonly<{ id: string; label: string; narrative: string }> | null;
}>;

const mapState = (state: "waiting" | "live" | "empty" | "stale" | "error"): Ax1ProjectionState =>
  state === "live" ? "confirmed" : state === "stale" ? "stale" : state === "waiting" ? "loading" : "unavailable";

function SurfaceCards({ entries }: { entries: readonly Readonly<{ title: string; value?: ReactNode; note: string; icon?: ReactNode }>[] }) {
  return <div className="ax1-projection-grid">{entries.map(entry => <article className="ax1-projection-card" key={entry.title}>
    <h4 className="flex items-center gap-2">{entry.icon}{entry.title}</h4>
    <UnknownValue>{entry.value}</UnknownValue><p>{entry.note}</p>
  </article>)}</div>;
}

export function MiniMap({ world, position, remotePlayers, state, onOpen }: {
  world?: Ax1ConfirmedWorld;
  position?: { x: number; z: number };
  remotePlayers: readonly ConfirmedZonePresence[];
  state: "waiting" | "live" | "empty" | "stale" | "error";
  onOpen: () => void;
}) {
  const confirmed = state === "live" && position;
  return <button type="button" className="ax1-confirmed-minimap" aria-label="Weltatlas öffnen" onClick={onOpen} data-state={state}>
    <span className="ax1-minimap-grid" aria-hidden="true" />
    {world?.pointsOfInterest.slice(0, 8).map((poi, index) => <i key={poi.id} className={`ax1-minimap-poi ax1-minimap-poi--${poi.kind}`} style={{ left: `${18 + index % 4 * 21}%`, top: `${22 + Math.floor(index / 4) * 38}%` }} />)}
    {confirmed && <i className="ax1-minimap-player" />}
    <span className="ax1-minimap-label"><Compass size={12} />{world?.displayName ?? "Welt wird bestätigt"}</span>
    <small>{confirmed ? `${remotePlayers.length} Explorer · ${Math.round(position.x / 1000)}, ${Math.round(position.z / 1000)}` : "—"}</small>
  </button>;
}

export function WorldMapModal({ open, onClose, world, position, remotePlayers, state }: {
  open: boolean; onClose: () => void; world?: Ax1ConfirmedWorld; position?: { x: number; z: number };
  remotePlayers: readonly ConfirmedZonePresence[]; state: "waiting" | "live" | "empty" | "stale" | "error";
}) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id="worldmap" title="Weltatlas" eyebrow="AX1 Dynamic World" state={mapState(state)} footer={`AX1 ${AX1_VISIBLE_SOURCE_REVISION.slice(0, 12)} · keine Client-Chunk- oder Spawn-Authority`}>
    <div className="ax1-world-map-canvas" aria-label="Bestätigte Weltprojektion">
      <div className="ax1-world-map-center"><Compass /><b>{world?.displayName ?? "—"}</b><span>{position ? `${(position.x / 1000).toFixed(2)} / ${(position.z / 1000).toFixed(2)}` : "—"}</span></div>
      {world?.pointsOfInterest.map((poi, index) => <article key={poi.id} className="ax1-world-map-poi" style={{ left: `${12 + index % 4 * 24}%`, top: `${18 + Math.floor(index / 4) * 30}%` }}><MapPin size={14} /><span>{poi.label}</span><small>{poi.kind} · {poi.state}</small></article>)}
    </div>
    <SurfaceCards entries={[
      { title: "Weltepoche", value: world?.epoch, note: "Bestätigter globaler Snapshot", icon: <Sparkles size={14} /> },
      { title: "World Hash", value: world?.deterministicHash, note: "Readback, nicht lokal erzeugt", icon: <Database size={14} /> },
      { title: "Explorer", value: state === "live" ? remotePlayers.length + 1 : undefined, note: "Bestätigte Zonenpräsenzen", icon: <Users size={14} /> },
    ]} />
  </Ax1ProjectionModal>;
}

export function ClassSelectModal({ open, onClose, tracks, state }: { open: boolean; onClose: () => void; tracks?: readonly Readonly<{ trackKind: string; trackId: string; levelExact: string }>[]; state: Ax1ProjectionState }) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id="disciplines" title="Disziplinen & Pfade" eyebrow="AX1 Classless Progression" state={state}>
    <p className="ax1-notice">AX1 ist das Hauptspiel. Feste Aurion-Klassen werden nicht gewählt; bestätigte Waffen- und Skillpfade formen die Spielfigur.</p>
    <SurfaceCards entries={(tracks?.length ? tracks : [{ trackKind: "weapon", trackId: "—", levelExact: "—" }]).map(track => ({ title: track.trackKind === "weapon" ? "Waffenpfad" : "Skillpfad", value: track.trackId, note: `Bestätigte Stufe ${track.levelExact}`, icon: <Swords size={14} /> }))} />
  </Ax1ProjectionModal>;
}

function ContractPendingModal({ open, onClose, id, title, eyebrow, icon, cards }: { open: boolean; onClose: () => void; id: string; title: string; eyebrow: string; icon: ReactNode; cards: readonly string[] }) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id={id} title={title} eyebrow={eyebrow} state="unavailable" footer="Die Oberfläche ist vollständig AX1; fachliche Aktionen bleiben bis zum bestätigten AX1/WASD-Vertrag deaktiviert.">
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-cyan-900 bg-black/40 p-4 text-cyan-200">{icon}<p className="text-xs">Keine lokalen Starterwerte, Belohnungen, Preise oder Erfolgszustände.</p></div>
    <SurfaceCards entries={cards.map(title => ({ title, value: "—", note: "Bestätigter Readback ausstehend" }))} />
    <button type="button" className="ax1-primary mt-4" disabled>Aktion nicht verfügbar</button>
  </Ax1ProjectionModal>;
}

export const GuildManagementModal = (props: { open: boolean; onClose: () => void }) => <ContractPendingModal {...props} id="guild" title="Gildenverwaltung" eyebrow="AX1 Guild & Leylines" icon={<Crown />} cards={["Gilde", "Mitglieder", "Schatzkammer", "Leylinien"]} />;
export const NPCEconomyModal = (props: { open: boolean; onClose: () => void }) => <ContractPendingModal {...props} id="economy" title="Lebendige Ökonomie" eyebrow="AX1 Merchant Economy" icon={<Coins />} cards={["Marktregion", "Währung", "Händlerbeziehung", "Buyback"]} />;
export const TerritoryPoliticsModal = (props: { open: boolean; onClose: () => void }) => <ContractPendingModal {...props} id="territory" title="Territorium & Politik" eyebrow="AX1 Realm Governance" icon={<Shield />} cards={["Gebiet", "Eigentümer", "Stabilität", "Verteidigung"]} />;
export const HomesteadBuilderModal = (props: { open: boolean; onClose: () => void }) => <ContractPendingModal {...props} id="homestead" title="Homestead Builder" eyebrow="AX1 Housing" icon={<Hammer />} cards={["Parzelle", "Bauplan", "Materialien", "Platzierung"]} />;

export function NPCDialogueModal({ open, onClose, contacts, state }: { open: boolean; onClose: () => void; contacts: ReactNode; state: Ax1ProjectionState }) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id="dialogue" title="Dialoge & Beziehungen" eyebrow="AX1 Arelorian Lingua" state={state}>
    <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]"><SurfaceCards entries={[
      { title: "Semantische Beobachtung", value: state === "confirmed" ? "Receipt-gebunden" : undefined, note: "Lingua kann Kontext beschreiben, aber keine Beziehung oder Preise mutieren.", icon: <Languages size={14} /> },
      { title: "NPC-Antwort", value: state === "confirmed" ? "Bestätigter Readback" : undefined, note: "Entscheidung und Memory werden serverseitig gelesen.", icon: <ScrollText size={14} /> },
    ]} /><section className="ax1-projection-card"><h4>Bestätigte Kontakte</h4><div className="mt-3">{contacts}</div></section></div>
  </Ax1ProjectionModal>;
}

export function DeterminismDebugOverlay({ open, onClose, world, metrics, state }: { open: boolean; onClose: () => void; world?: Ax1ConfirmedWorld; metrics: ConfirmedCombatMetrics; state: Ax1ProjectionState }) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id="determinism" title="Determinismus & Evidence" eyebrow="AX1 Observation Side-Channel" state={state}>
    <SurfaceCards entries={[
      { title: "World Hash", value: world?.deterministicHash, note: "Bestätigter Aurion-Persistenzreadback", icon: <Database size={14} /> },
      { title: "Letzter Combat-Tick", value: metrics.lastTick, note: "WASD/Zone-bestätigte Ereignisse", icon: <Activity size={14} /> },
      { title: "Combat Events", value: metrics.eventCount, note: "Dedupliziert nach bestätigter Sequenz", icon: <Swords size={14} /> },
      { title: "AX1 Source", value: AX1_VISIBLE_SOURCE_REVISION.slice(0, 12), note: "Revisionsgebundene UI-Quelle", icon: <Castle size={14} /> },
    ]} />
  </Ax1ProjectionModal>;
}

export function ResearchModal({ open, onClose, onOpenCompanion, onOpenEvidence }: { open: boolean; onClose: () => void; onOpenCompanion: () => void; onOpenEvidence: () => void }) {
  return <Ax1ProjectionModal open={open} onClose={onClose} id="research" title="Research & Learning" eyebrow="AX1 Research Lane" state="confirmed" footer="Research beobachtet bestätigte Spielzustände; Ausfall oder Modelloutput verändert keine Gameplay-Wahrheit.">
    <div className="ax1-projection-grid">
      <article className="ax1-projection-card"><h4 className="flex items-center gap-2"><BrainCircuit size={15} />Companion Learning</h4><p>Learn / Record, Go / Play und Stop / Despawn bleiben als begrenzte Beobachtungs- und Aktionsspur erhalten.</p><button type="button" className="ax1-tab mt-3" onClick={onOpenCompanion}>Companion-Lane öffnen</button></article>
      <article className="ax1-projection-card"><h4 className="flex items-center gap-2"><FlaskConical size={15} />Wolfram CAG</h4><p>Mathematische Analyse und Balancing-Evidence bleiben serverseitige Research-Werkzeuge, nie Runtime-Authority.</p><UnknownValue>Receipt-gebundene Provider-Lane</UnknownValue></article>
      <article className="ax1-projection-card"><h4 className="flex items-center gap-2"><Database size={15} />Replay & Hash Evidence</h4><p>Bestätigte Ticks, Welt-Hashes und Combat-Events können inspiziert werden.</p><button type="button" className="ax1-tab mt-3" onClick={onOpenEvidence}>Evidence öffnen</button></article>
    </div>
  </Ax1ProjectionModal>;
}
