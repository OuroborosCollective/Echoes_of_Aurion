import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Database, ShieldCheck, X } from "lucide-react";
import { Ax1Modal } from "./Ax1Modal";

export type Ax1ProjectionState = "loading" | "confirmed" | "stale" | "unavailable";

const labels: Record<Ax1ProjectionState, string> = {
  loading: "Bestätigte Daten werden geladen …",
  confirmed: "Serverbestätigter Stand",
  stale: "Stand ist veraltet · Aktualisierung ausstehend",
  unavailable: "Noch kein bestätigter WASD-Vertrag verfügbar",
};

export function Ax1ProjectionModal({ open, onClose, id, title, eyebrow, state, children, footer }: {
  open: boolean;
  onClose: () => void;
  id: string;
  title: string;
  eyebrow: string;
  state: Ax1ProjectionState;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const confirmed = state === "confirmed";
  return <Ax1Modal open={open} onClose={onClose} id={id} title={title}>
    <section className="ax1-window w-full max-w-5xl bg-[#081a2e] border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 text-gray-200 flex flex-col max-h-[92dvh] overflow-hidden" data-projection-state={state}>
      <header className="ax1-window-header flex items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div className="flex items-center gap-3"><div className="ax1-crest">{confirmed ? <CheckCircle2 /> : <ShieldCheck />}</div><div><p className="text-[10px] uppercase tracking-[.18em] text-cyan-300">{eyebrow}</p><h3 className="font-serif font-bold text-white">{title}</h3></div></div>
        <button type="button" onClick={onClose} aria-label={`${title} schließen`} className="ax1-close"><X size={18} /></button>
      </header>
      <p className={`ax1-projection-state ax1-projection-state--${state}`} role="status">{confirmed ? <Database size={14} /> : <AlertTriangle size={14} />}{labels[state]}</p>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-3">{children}</div>
      {footer && <footer className="border-t border-gray-800 pt-3 text-xs text-gray-400">{footer}</footer>}
    </section>
  </Ax1Modal>;
}

export function UnknownValue({ children }: { children: ReactNode }) {
  return <span className="ax1-unknown-value">{children === null || children === undefined || children === "" ? "—" : children}</span>;
}
