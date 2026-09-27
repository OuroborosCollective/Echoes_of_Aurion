import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_SPATIAL_CONSTRAINT_FIELD_VERSION = "aurion.spatial-constraint-field.v1" as const;
export const SPATIAL_CONSTRAINT_Q16_MAX = 65_536 as const;

export const SPATIAL_TRAVERSAL_MODES = ["ground", "climb", "glide", "fly"] as const;
export type SpatialTraversalMode = (typeof SPATIAL_TRAVERSAL_MODES)[number];

export type SpatialConstraintFieldInput = Readonly<{
  fieldVersion?: typeof AURION_SPATIAL_CONSTRAINT_FIELD_VERSION;
  worldRevision: string;
  chunkKey: string;
  sourceStructureHash: string;
  navigationRevision: string;
  minAltitudeQ16?: number;
  maxAltitudeQ16?: number;
  traversalCostQ16: number;
  riskQ16: number;
  allowedModes: readonly SpatialTraversalMode[];
}>;

export type SpatialConstraintField = Readonly<SpatialConstraintFieldInput & {
  fieldVersion: typeof AURION_SPATIAL_CONSTRAINT_FIELD_VERSION;
  fieldHash: string;
}>;

export type SpatialTraversalPoint = Readonly<{
  nodeId: string;
  xMm: number;
  altitudeQ16: number;
  zMm: number;
}>;

export type SpatialTraversalPathCandidate = Readonly<{
  id: string;
  mode: SpatialTraversalMode;
  waypoints: readonly SpatialTraversalPoint[];
  fields: readonly SpatialConstraintField[];
}>;

export type SpatialTraversalPlan = Readonly<{
  fieldVersion: typeof AURION_SPATIAL_CONSTRAINT_FIELD_VERSION;
  worldRevision: string;
  startNodeId: string;
  goalNodeId: string;
  candidateId: string;
  mode: SpatialTraversalMode;
  waypointIds: readonly string[];
  fieldHashes: readonly string[];
  totalCostQ16: number;
  totalRiskQ16: number;
  routeHash: string;
}>;

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA1_RE = /^[a-f0-9]{40}$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

function identifier(value: string, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value.trim())) {
    throw new Error(`SPATIAL_CONSTRAINT_${label.toUpperCase()}_INVALID`);
  }
  return value.trim();
}

function safeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`SPATIAL_CONSTRAINT_${label.toUpperCase()}_INVALID`);
  return value;
}

function q16(value: number, label: string): number {
  safeInteger(value, label);
  if (value < 0 || value > SPATIAL_CONSTRAINT_Q16_MAX) {
    throw new Error(`SPATIAL_CONSTRAINT_${label.toUpperCase()}_INVALID`);
  }
  return value;
}

function revision(value: string, label: string): string {
  const normalized = identifier(value, label);
  if (!SHA1_RE.test(normalized)) throw new Error(`SPATIAL_CONSTRAINT_${label.toUpperCase()}_INVALID`);
  return normalized;
}

function hash(value: string, label: string): string {
  const normalized = identifier(value, label);
  if (!SHA256_RE.test(normalized)) throw new Error(`SPATIAL_CONSTRAINT_${label.toUpperCase()}_INVALID`);
  return normalized;
}

function orderedModes(modes: readonly SpatialTraversalMode[]): readonly SpatialTraversalMode[] {
  if (modes.length < 1 || modes.length > SPATIAL_TRAVERSAL_MODES.length) {
    throw new Error("SPATIAL_CONSTRAINT_ALLOWED_MODES_INVALID");
  }
  const unique = new Set(modes);
  if (unique.size !== modes.length || modes.some(mode => !SPATIAL_TRAVERSAL_MODES.includes(mode))) {
    throw new Error("SPATIAL_CONSTRAINT_ALLOWED_MODES_INVALID");
  }
  return Object.freeze(SPATIAL_TRAVERSAL_MODES.filter(mode => unique.has(mode)));
}

function validateFieldInput(input: SpatialConstraintFieldInput): Readonly<{
  fieldVersion: typeof AURION_SPATIAL_CONSTRAINT_FIELD_VERSION;
  worldRevision: string;
  chunkKey: string;
  sourceStructureHash: string;
  navigationRevision: string;
  minAltitudeQ16?: number;
  maxAltitudeQ16?: number;
  traversalCostQ16: number;
  riskQ16: number;
  allowedModes: readonly SpatialTraversalMode[];
}> {
  if (input.fieldVersion !== undefined && input.fieldVersion !== AURION_SPATIAL_CONSTRAINT_FIELD_VERSION) {
    throw new Error("SPATIAL_CONSTRAINT_FIELD_VERSION_INVALID");
  }
  const worldRevision = revision(input.worldRevision, "world_revision");
  const chunkKey = identifier(input.chunkKey, "chunk_key");
  const sourceStructureHash = hash(input.sourceStructureHash, "source_structure_hash");
  const navigationRevision = identifier(input.navigationRevision, "navigation_revision");
  let minAltitudeQ16: number | undefined;
  let maxAltitudeQ16: number | undefined;
  if (input.minAltitudeQ16 !== undefined) minAltitudeQ16 = q16(input.minAltitudeQ16, "min_altitude_q16");
  if (input.maxAltitudeQ16 !== undefined) maxAltitudeQ16 = q16(input.maxAltitudeQ16, "max_altitude_q16");
  if (minAltitudeQ16 !== undefined && maxAltitudeQ16 !== undefined && maxAltitudeQ16 < minAltitudeQ16) {
    throw new Error("SPATIAL_CONSTRAINT_ALTITUDE_RANGE_INVALID");
  }
  const traversalCostQ16 = q16(input.traversalCostQ16, "traversal_cost_q16");
  const riskQ16 = q16(input.riskQ16, "risk_q16");
  const allowedModes = orderedModes(input.allowedModes);
  return Object.freeze({
    fieldVersion: AURION_SPATIAL_CONSTRAINT_FIELD_VERSION,
    worldRevision,
    chunkKey,
    sourceStructureHash,
    navigationRevision,
    ...(minAltitudeQ16 === undefined ? {} : { minAltitudeQ16 }),
    ...(maxAltitudeQ16 === undefined ? {} : { maxAltitudeQ16 }),
    traversalCostQ16,
    riskQ16,
    allowedModes,
  });
}

export function createSpatialConstraintField(input: SpatialConstraintFieldInput): SpatialConstraintField {
  const canonical = validateFieldInput(input);
  return Object.freeze({
    ...canonical,
    fieldHash: canonicalSha256({
      domain: AURION_SPATIAL_CONSTRAINT_FIELD_VERSION,
      field: canonical,
    }),
  });
}

export function validateSpatialConstraintField(field: SpatialConstraintField): SpatialConstraintField {
  const canonical = validateFieldInput(field);
  const expected = canonicalSha256({
    domain: AURION_SPATIAL_CONSTRAINT_FIELD_VERSION,
    field: canonical,
  });
  if (field.fieldHash !== expected) throw new Error("SPATIAL_CONSTRAINT_FIELD_HASH_MISMATCH");
  return Object.freeze({ ...canonical, fieldHash: expected });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validatePoint(point: SpatialTraversalPoint): SpatialTraversalPoint {
  const nodeId = identifier(point.nodeId, "node_id");
  const xMm = safeInteger(point.xMm, "x_mm");
  const zMm = safeInteger(point.zMm, "z_mm");
  const altitudeQ16 = q16(point.altitudeQ16, "altitude_q16");
  return Object.freeze({ nodeId, xMm, altitudeQ16, zMm });
}

function validateCandidate(candidate: SpatialTraversalPathCandidate, capabilities: readonly SpatialTraversalMode[], worldRevision: string): SpatialTraversalPathCandidate {
  const id = identifier(candidate.id, "candidate_id");
  if (!SPATIAL_TRAVERSAL_MODES.includes(candidate.mode) || !capabilities.includes(candidate.mode)) {
    throw new Error("SPATIAL_CONSTRAINT_TRAVERSAL_MODE_BLOCKED");
  }
  if (candidate.waypoints.length < 2 || candidate.fields.length !== candidate.waypoints.length - 1) {
    throw new Error("SPATIAL_CONSTRAINT_ROUTE_SHAPE_INVALID");
  }
  const waypoints = Object.freeze(candidate.waypoints.map(validatePoint));
  const nodeIds = new Set<string>();
  for (const point of waypoints) {
    if (nodeIds.has(point.nodeId)) throw new Error("SPATIAL_CONSTRAINT_ROUTE_DUPLICATE_NODE");
    nodeIds.add(point.nodeId);
  }
  const fields = Object.freeze(candidate.fields.map(validateSpatialConstraintField));
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.worldRevision !== worldRevision) throw new Error("SPATIAL_CONSTRAINT_WORLD_REVISION_MISMATCH");
    const from = waypoints[index]!;
    const to = waypoints[index + 1]!;
    if (field.minAltitudeQ16 !== undefined && (from.altitudeQ16 < field.minAltitudeQ16 || to.altitudeQ16 < field.minAltitudeQ16)) {
      throw new Error("SPATIAL_CONSTRAINT_MIN_ALTITUDE_BLOCKED");
    }
    if (field.maxAltitudeQ16 !== undefined && (from.altitudeQ16 > field.maxAltitudeQ16 || to.altitudeQ16 > field.maxAltitudeQ16)) {
      throw new Error("SPATIAL_CONSTRAINT_MAX_ALTITUDE_BLOCKED");
    }
  }
  return Object.freeze({ id, mode: candidate.mode, waypoints, fields });
}

export function planDeterministic3DTraversal(input: Readonly<{
  worldRevision: string;
  capabilities: readonly SpatialTraversalMode[];
  candidates: readonly SpatialTraversalPathCandidate[];
}>): SpatialTraversalPlan {
  const worldRevision = revision(input.worldRevision, "world_revision");
  const capabilities = orderedModes(input.capabilities);
  if (input.candidates.length < 1 || input.candidates.length > 32) throw new Error("SPATIAL_CONSTRAINT_CANDIDATE_SET_INVALID");
  const candidates = input.candidates.map(candidate => validateCandidate(candidate, capabilities, worldRevision))
    .sort((left, right) => compareText(left.id, right.id));
  const duplicate = candidates.some((candidate, index) => index > 0 && candidate.id === candidates[index - 1]!.id);
  if (duplicate) throw new Error("SPATIAL_CONSTRAINT_CANDIDATE_DUPLICATE");

  const scored = candidates.map(candidate => {
    let totalCostQ16 = 0;
    let totalRiskQ16 = 0;
    for (const field of candidate.fields) {
      totalCostQ16 += field.traversalCostQ16;
      totalRiskQ16 += field.riskQ16;
    }
    return { candidate, totalCostQ16, totalRiskQ16 };
  }).sort((left, right) =>
    left.totalCostQ16 - right.totalCostQ16 ||
    left.totalRiskQ16 - right.totalRiskQ16 ||
    compareText(left.candidate.id, right.candidate.id)
  );
  const winner = scored[0]!;
  const startNodeId = winner.candidate.waypoints[0]!.nodeId;
  const goalNodeId = winner.candidate.waypoints[winner.candidate.waypoints.length - 1]!.nodeId;
  const routeHash = canonicalSha256({
    domain: "aurion.spatial-constraint-route.v1",
    worldRevision,
    startNodeId,
    goalNodeId,
    candidateId: winner.candidate.id,
    mode: winner.candidate.mode,
    waypointIds: winner.candidate.waypoints.map(point => point.nodeId),
    waypoints: winner.candidate.waypoints,
    fieldHashes: winner.candidate.fields.map(field => field.fieldHash),
    totalCostQ16: winner.totalCostQ16,
    totalRiskQ16: winner.totalRiskQ16,
  });
  return Object.freeze({
    fieldVersion: AURION_SPATIAL_CONSTRAINT_FIELD_VERSION,
    worldRevision,
    startNodeId,
    goalNodeId,
    candidateId: winner.candidate.id,
    mode: winner.candidate.mode,
    waypointIds: Object.freeze(winner.candidate.waypoints.map(point => point.nodeId)),
    fieldHashes: Object.freeze(winner.candidate.fields.map(field => field.fieldHash)),
    totalCostQ16: winner.totalCostQ16,
    totalRiskQ16: winner.totalRiskQ16,
    routeHash,
  });
}

export function replayDeterministic3DTraversal(input: Readonly<{
  plan: SpatialTraversalPlan;
  capabilities: readonly SpatialTraversalMode[];
  candidates: readonly SpatialTraversalPathCandidate[];
}>): SpatialTraversalPlan {
  const expected = planDeterministic3DTraversal({
    worldRevision: input.plan.worldRevision,
    capabilities: input.capabilities,
    candidates: input.candidates,
  });
  if (expected.routeHash !== input.plan.routeHash || expected.candidateId !== input.plan.candidateId || expected.waypointIds.join("|") !== input.plan.waypointIds.join("|")) {
    throw new Error("SPATIAL_CONSTRAINT_REPLAY_DIVERGENCE");
  }
  return expected;
}
