import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { InvestigationJournal } from "@shared/investigationJournalProtocol";
import {
  DEDUCTION_MAX_CLAIMS,
  guidancePresentation,
  investigationDeductionRequestSchema,
  type DeductionType,
  type InvestigationDeductionRequest,
  type JournalGuidance,
} from "@shared/investigationClientContract";

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

// REQUIRES edges are not part of the journal readmodel yet. Do not offer a
// chain operation that the player cannot construct from disclosed relations.
const DEDUCTION_LABEL: Readonly<Partial<Record<DeductionType, string>>> = Object.freeze({
  affirm: "Bestätigen",
  challenge: "Anfechten",
});

/**
 * Aurion Investigation Journal & Rumor Board (Issue #784).
 *
 * Pure presentation of a server-confirmed readmodel: the component renders
 * the journal it receives and sends a revision-bound claim selection. It
 * holds no truth of its own — no localStorage, no local solved flags, no
 * invented clues. The server constructs and revalidates every intent against
 * the bound projection revision.
 */
export function InvestigationJournalModal(
  props: Readonly<{
    isOpen: boolean;
    onClose: () => void;
    journal: InvestigationJournal | null;
    guidance: JournalGuidance;
    pending: boolean;
    message?: string;
    onGuidanceChange: (guidance: JournalGuidance) => void;
    onSubmitDeduction: (request: InvestigationDeductionRequest) => void;
  }>
) {
  const { isOpen, onClose, journal, guidance, pending, message, onGuidanceChange, onSubmitDeduction } = props;
  const [selection, setSelection] = useState<{ journalHash: string; ids: readonly string[] }>({
    journalHash: journal?.journalHash ?? "",
    ids: [],
  });
  const selected = journal && selection.journalHash === journal.journalHash ? selection.ids : [];
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const journalHash = journal?.journalHash ?? "";
    setSelection(current => current.journalHash === journalHash
      ? current
      : { journalHash, ids: [] });
  }, [journal?.journalHash]);
  const presentation = useMemo(
    () => guidancePresentation(journal?.guidance ?? guidance),
    [guidance, journal?.guidance]
  );

  if (!isOpen) return null;

  const toggle = (claimId: string) => {
    if (!journal) return;
    setSelection(current => {
      const ids = current.journalHash === journal.journalHash ? current.ids : [];
      return {
        journalHash: journal.journalHash,
        ids: ids.includes(claimId)
          ? ids.filter(id => id !== claimId)
          : ids.length < DEDUCTION_MAX_CLAIMS ? [...ids, claimId] : ids,
      };
    });
  };

  const submit = (deductionType: DeductionType) => {
    if (!journal) return;
    const request = investigationDeductionRequestSchema.parse({
      selectedClaimIds: selected,
      deductionType,
      sourceProjectionHash: journal.sourceProjectionHash,
    });
    onSubmitDeduction(request);
    setSelection({ journalHash: journal.journalHash, ids: [] });
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        aria-label="Investigationsjournal & Gerüchtetafel"
        aria-modal="true"
        aria-describedby={undefined}
        showCloseButton={false}
        style={styles.panel}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={event => {
          if (opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
      >
        <header style={styles.header}>
          <DialogTitle style={styles.title}>Investigationsjournal &amp; Gerüchtetafel</DialogTitle>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            style={styles.close}
          >
            ×
          </button>
        </header>

        <label style={styles.guidance}>
          <span>Hinweisstufe</span>
          <select
            aria-label="Hinweisstufe"
            value={journal?.guidance ?? guidance}
            disabled={pending}
            onChange={event => onGuidanceChange(event.currentTarget.value as JournalGuidance)}
            style={styles.guidanceSelect}
          >
            <option value="whisper">Flüstern</option>
            <option value="plot">Handlung</option>
            <option value="conspiracy">Verschwörung</option>
          </select>
        </label>

        {journal ? (
          <>
        {message ? <p role="status" style={styles.empty}>{message}</p> : null}

        {journal.investigations.length === 0 && (
          <p style={styles.empty}>
            Keine bestätigten Gerüchte im aktuellen Wissensstand.
          </p>
        )}

        {journal.investigations.map(investigation => (
          <section
            key={investigation.investigationId}
            aria-label={`Fall ${investigation.predicate}`}
            style={styles.case}
          >
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
                      disabled={pending || (!selected.includes(entry.claimId) && selected.length >= DEDUCTION_MAX_CLAIMS)}
                      onChange={() => toggle(entry.claimId)}
                    />
                    <span>
                      {entry.value}
                      {" — "}
                      Verlässlichkeit: {BAND_LABEL[entry.confidenceBand]}
                      {presentation.showProvenance && (
                        <em style={styles.meta}>
                          {" "}
                          ·{" "}
                          {entry.provenanceMasked
                            ? "Quelle verborgen"
                            : SOURCE_CLASS_LABEL[entry.sourceClass]}
                        </em>
                      )}
                    </span>
                  </label>
                  {presentation.showRelations &&
                    entry.contradictedBy.length > 0 && (
                      <span style={styles.relation}>
                        widerspricht {entry.contradictedBy.length}{" "}
                        Behauptung(en)
                      </span>
                    )}
                  {presentation.showRelations &&
                    entry.corroboratedBy.length > 0 && (
                      <span style={styles.relation}>
                        gestützt durch {entry.corroboratedBy.length}{" "}
                        Behauptung(en)
                      </span>
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
          </>
        ) : (
          <p role={pending ? "status" : "alert"} style={styles.empty}>
            {pending
              ? "Bestätigter Journalstand wird vom Server geladen."
              : message || "Der serverbestätigte Journalstand ist derzeit nicht verfügbar."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    background: "#101826",
    color: "#dbe4f0",
    border: "1px solid #2c3e50",
    borderRadius: 8,
    padding: 16,
    width: "min(560px, 94vw)",
    maxHeight: "86vh",
    overflowY: "auto",
    display: "block",
    zIndex: 60,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { margin: 0, fontSize: 18 },
  close: {
    background: "none",
    border: "none",
    color: "#9fb3c8",
    fontSize: 22,
    cursor: "pointer",
  },
  empty: { color: "#9fb3c8" },
  guidance: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "#9fb3c8" },
  guidanceSelect: {
    background: "#172235",
    border: "1px solid #2c3e50",
    borderRadius: 4,
    color: "#dbe4f0",
    minHeight: 36,
    padding: "0 8px",
  },
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
  entryLabel: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    cursor: "pointer",
  },
  relation: {
    display: "block",
    marginLeft: 24,
    fontSize: 12,
    color: "#8fa8c0",
  },
  meta: { color: "#8fa8c0", fontSize: 12 },
  footer: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 14 },
  action: {
    background: "#2c3e50",
    border: "1px solid #3d566e",
    borderRadius: 4,
    color: "#e6eef7",
    padding: "6px 12px",
    cursor: "pointer",
  },
};
