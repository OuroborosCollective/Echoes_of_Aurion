import {
  applyCompanionIntent,
  assertCompanionInvariants,
  companionCanAct,
  createCompanionSession,
  type CompanionSession,
} from "@shared/companionLearningProtocol";

export type CompanionAction = [number, number, number, number];
export type CompanionDatasetRow = {
  schema_version: "aurion-companion-dataset.v1";
  sample_id: string;
  session_id: string;
  sequence_index: number;
  timestamp_epoch: number;
  input_frame_base64: string;
  feature_vector: number[];
  target_action_chunk: [CompanionAction];
  state_vector: number[];
  state_mask: number[];
  note: string;
};

const DATASET_KEY = "echoes-of-aurion.companion-dataset.v1";
const SESSION_KEY = "echoes-of-aurion.companion-session.v1";
const MINIMUM_STATE_VECTOR_LENGTH = 6;
const MAXIMUM_STATE_VECTOR_LENGTH = 32;

function normalizedStateVector(values?: number[]): number[] {
  const result = (values ?? [])
    .slice(0, MAXIMUM_STATE_VECTOR_LENGTH)
    .map(value => (Number.isFinite(value) ? value : 0));
  while (result.length < MINIMUM_STATE_VECTOR_LENGTH) result.push(0);
  return result;
}

function normalizedStateMask(
  values: number[] | undefined,
  length: number
): number[] {
  const result = (values ?? [])
    .slice(0, length)
    .map(value => (value === 1 ? 1 : 0));
  while (result.length < length) result.push(0);
  return result;
}

function hashIdentity(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readRows(): CompanionDatasetRow[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DATASET_KEY) ?? "[]"
    ) as CompanionDatasetRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRows(rows: CompanionDatasetRow[]): void {
  localStorage.setItem(DATASET_KEY, JSON.stringify(rows.slice(-5000)));
  window.dispatchEvent(
    new CustomEvent("aurion:companion-dataset-updated", {
      detail: { count: rows.length },
    })
  );
}

export function readCompanionDataset(): CompanionDatasetRow[] {
  return readRows();
}

export function exportCompanionDataset(): string {
  return JSON.stringify(
    {
      format: "echoes-of-aurion-companion-dataset",
      version: 1,
      rows: readRows(),
    },
    null,
    2
  );
}

export function loadCompanionSession(): CompanionSession | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SESSION_KEY) ?? "null"
    ) as CompanionSession | null;
    if (!parsed) return null;
    assertCompanionInvariants(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: CompanionSession): CompanionSession {
  assertCompanionInvariants(session);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(
    new CustomEvent("aurion:companion-state", { detail: session })
  );
  return session;
}

export function startCompanionSession(
  userId: number,
  llmLabel: string
): CompanionSession {
  const session = createCompanionSession({
    sessionId: `cmp_${Date.now().toString(36)}`,
    userId,
    llmLabel,
  });
  return saveSession(session);
}

export function transitionCompanionSession(
  intent: Parameters<typeof applyCompanionIntent>[1]
): CompanionSession {
  const current = loadCompanionSession();
  if (!current) throw new Error("Kein verbundener Companion vorhanden");
  return saveSession(applyCompanionIntent(current, intent));
}

export function companionActionAllowed(): boolean {
  const current = loadCompanionSession();
  return current ? companionCanAct(current) : false;
}

export function recordCompanionObservation(input: {
  frameDataUrl: string;
  featureVector: number[];
  action?: CompanionAction;
  stateVector?: number[];
  stateMask?: number[];
  note?: string;
}): CompanionDatasetRow | null {
  const session = loadCompanionSession();
  if (
    !session ||
    session.mode !== "learning" ||
    !session.online ||
    !input.action ||
    input.featureVector.length !== 16
  )
    return null;
  const sequenceIndex = session.datasetRows;
  const stateVector = normalizedStateVector(input.stateVector);
  const stateMask = normalizedStateMask(input.stateMask, stateVector.length);
  const rowBase = {
    schema_version: "aurion-companion-dataset.v1" as const,
    session_id: session.sessionId,
    sequence_index: sequenceIndex,
    timestamp_epoch: Date.now(),
    input_frame_base64: input.frameDataUrl,
    feature_vector: input.featureVector.slice(),
    target_action_chunk: [input.action] as [CompanionAction],
    state_vector: stateVector,
    state_mask: stateMask,
    note: input.note?.trim().slice(0, 280) ?? "",
  };
  const sampleId = hashIdentity(JSON.stringify(rowBase));
  const row: CompanionDatasetRow = { ...rowBase, sample_id: sampleId };
  const rows = readRows();
  const isNew = !rows.some(candidate => candidate.sample_id === sampleId);
  if (!isNew) return row;
  persistRows([...rows, row]);
  saveSession({
    ...session,
    datasetRows: session.datasetRows + 1,
    notes: session.notes + (row.note ? 1 : 0),
  });
  return row;
}

export function companionDatasetCount(): number {
  return readRows().length;
}
