import React, { useEffect, useState, useMemo } from "react";
import { MessageSquare, RefreshCw, Trash2, Download, Filter, MessageCircle, Terminal, Swords, AlertTriangle, Radio } from "lucide-react";
import { readLedger, resetLedger, exportLedger, recordNpcDialogue, type LedgerEntry, type LedgerKind } from "@/lib/ledger";

export interface NpcDialogueLedgerProps {
  initialFilter?: LedgerKind | "all";
  maxEntries?: number;
  className?: string;
  showControls?: boolean;
}

export function NpcDialogueLedger({
  initialFilter = "all",
  className = "",
  showControls = true,
}: NpcDialogueLedgerProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => readLedger());
  const [activeFilter, setActiveFilter] = useState<LedgerKind | "all">(initialFilter);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LedgerEntry[]>).detail;
      if (Array.isArray(detail)) {
        setEntries(detail);
      } else {
        setEntries(readLedger());
      }
    };

    window.addEventListener("aurion:ledger-updated", handleUpdate);
    return () => window.removeEventListener("aurion:ledger-updated", handleUpdate);
  }, []);

  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") return entries;
    return entries.filter((e) => e.kind === activeFilter);
  }, [entries, activeFilter]);

  const latestDialogue = useMemo(() => {
    const dialogues = entries.filter((e) => e.kind === "dialogue");
    return dialogues.length > 0 ? dialogues[dialogues.length - 1] : null;
  }, [entries]);

  const handleExport = () => {
    const data = exportLedger();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurion-ledger-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getKindIcon = (kind: LedgerKind) => {
    switch (kind) {
      case "dialogue":
        return <MessageCircle size={12} />;
      case "command":
        return <Terminal size={12} />;
      case "combat":
        return <Swords size={12} />;
      case "warning":
        return <AlertTriangle size={12} />;
      case "connection":
        return <Radio size={12} />;
      case "system":
      default:
        return <MessageSquare size={12} />;
    }
  };

  return (
    <section className={`command-console ${className}`} aria-label="Command Console & Dialogue Ledger">
      <div className="console-head">
        <div>
          <MessageSquare size={11} className="text-cyan-400" />
          <span>EXPEDITION & DIALOGUE LEDGER</span>
        </div>
        {showControls && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              title="Ledger exportieren"
              aria-label="Ledger exportieren"
              className="hover:text-cyan-300 transition-colors"
            >
              <Download size={11} />
            </button>
            <button
              type="button"
              onClick={() => resetLedger()}
              title="Ledger leeren"
              aria-label="Ledger leeren"
              className="hover:text-red-400 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      <div className="console-status" role="status">
        <MessageCircle size={14} className="text-cyan-400 shrink-0 mt-0.5" />
        <div>
          {latestDialogue ? (
            <span>
              <b className="text-cyan-200">{latestDialogue.title}: </b>
              <span className="italic text-slate-300">"{latestDialogue.detail}"</span>
            </span>
          ) : (
            <span className="text-slate-400 italic">Keine vorherigen NPC-Gespräche aufgezeichnet.</span>
          )}
        </div>
      </div>

      {showControls && (
        <div className="quick-commands" role="toolbar" aria-label="Ledger Filter">
          <button
            type="button"
            className={activeFilter === "all" ? "bg-cyan-500/30 text-cyan-200 border-cyan-400" : ""}
            onClick={() => setActiveFilter("all")}
          >
            ALLE ({entries.length})
          </button>
          <button
            type="button"
            className={activeFilter === "dialogue" ? "bg-cyan-500/30 text-cyan-200 border-cyan-400" : ""}
            onClick={() => setActiveFilter("dialogue")}
          >
            DIALOGE ({entries.filter((e) => e.kind === "dialogue").length})
          </button>
          <button
            type="button"
            className={activeFilter === "combat" ? "bg-cyan-500/30 text-cyan-200 border-cyan-400" : ""}
            onClick={() => setActiveFilter("combat")}
          >
            KAMPF
          </button>
        </div>
      )}

      <div className="ledger-list" role="log" aria-label="Historische Interaktionen">
        {filteredEntries.length === 0 ? (
          <div className="p-3 text-center text-[9px] text-slate-500 italic">
            Keine Einträge für den ausgewählten Filter.
          </div>
        ) : (
          filteredEntries
            .slice()
            .reverse()
            .map((entry) => (
              <div
                key={entry.id}
                className={`ledger-row ${entry.kind === "warning" ? "warning" : ""} ${
                  entry.kind === "dialogue" ? "dialogue-entry" : ""
                }`}
              >
                <span>{getKindIcon(entry.kind)}</span>
                <p>
                  <b className="flex items-center justify-between">
                    <span>{entry.title}</span>
                    <span className="text-[7px] font-mono text-cyan-400/60 font-normal">
                      {entry.at}
                    </span>
                  </b>
                  <small className={entry.kind === "dialogue" ? "text-cyan-100 font-serif italic" : ""}>
                    {entry.detail}
                  </small>
                </p>
              </div>
            ))
        )}
      </div>
    </section>
  );
}

export default NpcDialogueLedger;
