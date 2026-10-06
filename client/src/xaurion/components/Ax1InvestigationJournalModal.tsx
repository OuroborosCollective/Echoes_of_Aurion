import { useMemo, useState, type CSSProperties } from "react";
import {
  buildDeductionIntentFromJournal,
  guidancePresentation,
  type InvestigationJournal,
} from "@shared/investigationJournalProtocol";
import type { DeductionIntent, DeductionType } from "@shared/investigationGraphProtocol";

const BAND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  low: "fragil",
  medium: "umlaufend",
  high: "gestützt",
});

const SOURCE_CLASS_LABEL: Readonly<Record<string, string>> = Object.freeze({
  WITNESS: "Zeuge",
  DOCUMENT: "Dokument",
  WORLD_EVIDENCE: "Welt-Evidenz",
  HEARSAY: "Hörensagen",
});

const DEDUCTION_LABEL: Readonly<Record<DeductionType, string>> = Object.freeze({
  affirm: "Bestätigen",
  challenge: "Anfechten",
  chain: "Verketten",
});

/**
 * AX1 Investigation Journal & Rumor Board (Issue #784).
 *
 * Pure presentation of a server-confirmed readmodel: the component renders
 * the journal it receives and can assemble a deduction intent from the
 * disclosed claims. It holds no truth of its own — no localStorage, no
 * local solved flags, no invented clues. The server revalidates every
 * intent against the bound projection revision.
 */
export function Ax1InvestigationJournalModal(props: Readonly<{
  isOpen: boolean;
  onClose: () => void;
  journal: InvestigationJournal;
  pending: boolean;
  onSubmitDeduction: (intent: DeductionIntent) => void;
}>) {
  const { isOpen, onClose, journal, pending, onSubmitDeduction } = props;
  const [selected, setSelected] = useState<readonly string[]>([]);
  const presentation = useMemo(() => guidancePresentation(journal.guidance), [journal.guidance]);

  if (!isOpen) return null;

  const toggle = (claimId: string) => {
    setSelected(current =>
      current.includes(claimId) ? current.filter(id => id !== claimId) : [...current, claimId]
    );
  };

  const submit = (deductionType: DeductionType) => {
    const intent = buildDeductionIntentFromJournal({
      journal,
      selectedClaimIds: selected,
      deductionType,
    });
    onSubmitDeduction(intent);
    setSelected([]);
  };

  return (
    <div role="dialog" aria-label="Investigationsjournal & Gerüchtetafel" style={styles.overlay}>
      <div style={styles.panel}>
        <header style={styles.header}>
          <h2 style={styles.title}>Investigationsjournal</h2>
          <button type="button" aria-label="Schließen" onClick={onClose} style={styles.close}>
            ×
          </button>
        </header>

        {journal.investigations.length === 0 && (
          <p style={styles.empty}>Keine bestätigten Gerüchte im aktuellen Wissensstand.</p>
        )}

        {journal.investigations.map(investigation => (
          <section key={investigation.investigationId} aria-label={`Fall ${investigation.predicate}`} style={styles.case}>
            <h3 style={styles.caseTitle}>
              {investigation.subjectId} · {investigation.predicate}
              {investigation.hasContradiction && (
                <span style={styles.contradiction}>Widerspruch entdeckt</span>
              )}
            </h3>
            <ul style={styles.list}>
              {investigation.entries.map(entry => (
                <li key={entry.claimId} style={styles.entry}>
                  <label style={styles.entryLabel}>
                    <input
                      type="checkbox"
                      aria-label={`Behauptung ${entry.value} auswählen`}
                      checked={selected.includes(entry.claimId)}
                      onChange={() => toggle(entry.claimId)}
                    />
                    <span>
                      {entry.value}
                      {" — "}
                      Verlässlichkeit: {BAND_LABEL[entry.confidenceBand]}
                      {presentation.showProvenance && (
                        <em style={styles.meta}>
                          {" "}· {entry.provenanceMasked ? "Quelle verborgen" : SOURCE_CLASS_LABEL[entry.sourceClass]}
                        </em>
                      )}
                    </span>
                  </label>
                  {presentation.showRelations && entry.contradictedBy.length > 0 && (
                    <span style={styles.relation}>widerspricht {entry.contradictedBy.length} Behauptung(en)</span>
                  )}
                  {presentation.showRelations && entry.corroboratedBy.length > 0 && (
                    <span style={styles.relation}>gestützt durch {entry.corroboratedBy.length} Behauptung(en)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer style={styles.footer}>
          <span style={styles.meta}>{selected.length} ausgewählt</span>
          {(Object.keys(DEDUCTION_LABEL) as DeductionType[]).map(type => (
            <button
              key={type}
              type="button"
              disabled={pending || selected.length < 2}
              onClick={() => submit(type)}
              style={styles.action}
            >
              {DEDUCTION_LABEL[type]}
            </button>
          ))}
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6, 10, 18, 0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  panel: {
    background: "#101826",
    color: "#dbe4f0",
    border: "1px solid #2c3e50",
    borderRadius: 8,
    padding: 16,
    width: "min(560px, 94vw)",
    maxHeight: "86vh",
    overflowY: "auto",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { margin: 0, fontSize: 18 },
  close: { background: "none", border: "none", color: "#9fb3c8", fontSize: 22, cursor: "pointer" },
  empty: { color: "#9fb3c8" },
  case: { marginTop: 12, borderTop: "1px solid #223046", paddingTop: 8 },
  caseTitle: { margin: "4px 0", fontSize: 15 },
  contradiction: {
    marginLeft: 8,
    padding: "1px 6px",
    borderRadius: 4,
    background: "#5b2333",
    color: "#f2b8c6",
    fontSize: 12,
  },
  list: { listStyle: "none", margin: 0, padding: 0 },
  entry: { padding: "4px 0" },
  entryLabel: { display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer" },
  relation: { display: "block", marginLeft: 24, fontSize: 12, color: "#8fa8c0" },
  meta: { color: "#8fa8c0", fontSize: 12 },
  footer: { display: "flex", gap: 8, alignItems: "center", marginTop: 14 },
  action: {
    background: "#2c3e50",
    border: "1px solid #3d566e",
    borderRadius: 4,
    color: "#e6eef7",
    padding: "6px 12px",
    cursor: "pointer",
  },
};
