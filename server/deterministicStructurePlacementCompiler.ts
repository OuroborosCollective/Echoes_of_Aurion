import { canonicalSha256, domainSha256 } from "@shared/aurionCanonicalHash";
import {
  AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION,
  AURION_STRUCTURE_PLACEMENT_PROTOCOL,
  AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION,
  STRUCTURE_PLACEMENT_KINDS,
  STRUCTURE_PLACEMENT_MAX_CANDIDATES,
  STRUCTURE_PLACEMENT_MAX_EXISTING,
  STRUCTURE_PLACEMENT_MAX_FOOTPRINT_AREA_SQ_MM,
  STRUCTURE_PLACEMENT_MAX_RULES,
  type ExistingStructurePlacement,
  type StructurePlacement,
  type StructurePlacementBounds,
  type StructurePlacementCandidate,
  type StructurePlacementFailureCode,
  type StructurePlacementGraphUpdate,
  type StructurePlacementInput,
  type StructurePlacementKind,
  type StructurePlacementRejection,
  type StructurePlacementResolution,
  type StructurePlacementRule,
} from "@shared/deterministicStructurePlacementProtocol";

type Aabb = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE = Number.MAX_SAFE_INTEGER;

function fail(code: string, detail: string): never {
  throw new Error(`STRUCTURE_PLACEMENT_${code}:${detail}`);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function identifier(value: string, field: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value.trim()))
    fail("INVALID_IDENTIFIER", field);
  return value.trim();
}
function safeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) fail("INVALID_INTEGER", field);
  return value;
}
function positiveInteger(value: number, field: string): number {
  safeInteger(value, field);
  if (value <= 0) fail("INVALID_POSITIVE_INTEGER", field);
  return value;
}
function boundedBps(value: number, field: string): number {
  safeInteger(value, field);
  if (value < 0 || value > 10_000) fail("INVALID_BPS", field);
  return value;
}
function hash(value: unknown): string {
  return canonicalSha256(value);
}
function area(size: Readonly<{ x: number; z: number }>): number {
  const result = BigInt(size.x) * BigInt(size.z);
  if (result > BigInt(SAFE)) fail("SAFE_INTEGER_OVERFLOW", "footprint area");
  return Number(result);
}
function scaleAxis(value: number, scaleFixed: number): number {
  const result = (BigInt(value) * BigInt(scaleFixed)) / 1000n;
  if (result < 1n || result > BigInt(SAFE))
    fail("INVALID_SCALE_RESULT", "footprint");
  return Number(result);
}
function normalizeOrientation(value: number): number {
  safeInteger(value, "orientation");
  return ((value % 4) + 4) % 4;
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function validateBounds(
  bounds: StructurePlacementBounds | undefined
): StructurePlacementBounds | undefined {
  if (!bounds) return undefined;
  for (const [key, value] of Object.entries(bounds))
    safeInteger(value, `bounds.${key}`);
  if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ)
    fail("INVALID_BOUNDS", "min greater than max");
  return freeze({ ...bounds });
}

function validateRule(rule: StructurePlacementRule): StructurePlacementRule {
  const id = identifier(rule.id, "rule");
  if (!STRUCTURE_PLACEMENT_KINDS.includes(rule.matcher.kind))
    fail("INVALID_KIND", id);
  if (
    !Number.isSafeInteger(rule.priority) ||
    rule.priority < -1_000_000 ||
    rule.priority > 1_000_000
  )
    fail("INVALID_PRIORITY", id);
  const requiredTags = [
    ...new Set(
      (rule.matcher.requiredTags ?? []).map(tag =>
        identifier(tag, "required tag")
      )
    ),
  ].sort(compare);
  const forbiddenTags = [
    ...new Set(
      (rule.matcher.forbiddenTags ?? []).map(tag =>
        identifier(tag, "forbidden tag")
      )
    ),
  ].sort(compare);
  const footprintMm = {
    x: positiveInteger(rule.replacement.footprintMm.x, `${id}.footprint.x`),
    z: positiveInteger(rule.replacement.footprintMm.z, `${id}.footprint.z`),
  };
  const orientations = [
    ...new Set(rule.replacement.orientations.map(normalizeOrientation)),
  ].sort((a, b) => a - b);
  if (!orientations.length) fail("INVALID_ORIENTATIONS", id);
  const scaleMin = positiveInteger(
    rule.replacement.scaleRangeFixed.min,
    `${id}.scale.min`
  );
  const scaleMax = positiveInteger(
    rule.replacement.scaleRangeFixed.max,
    `${id}.scale.max`
  );
  if (scaleMin > scaleMax || scaleMax > 1_000_000)
    fail("INVALID_SCALE_RANGE", id);
  const portIds = [
    ...new Set(rule.replacement.portIds.map(port => identifier(port, "port"))),
  ].sort(compare);
  const constraints = rule.constraints;
  const minSpacingMm = safeInteger(
    constraints.minSpacingMm,
    `${id}.minSpacingMm`
  );
  const maxSlopeBps = boundedBps(constraints.maxSlopeBps, `${id}.maxSlopeBps`);
  if (minSpacingMm < 0) fail("INVALID_SPACING", id);
  const maxFootprintAreaSqMm =
    constraints.maxFootprintAreaSqMm === undefined
      ? undefined
      : positiveInteger(
          constraints.maxFootprintAreaSqMm,
          `${id}.maxFootprintAreaSqMm`
        );
  if (
    maxFootprintAreaSqMm !== undefined &&
    maxFootprintAreaSqMm > STRUCTURE_PLACEMENT_MAX_FOOTPRINT_AREA_SQ_MM
  )
    fail("INVALID_FOOTPRINT_BUDGET", id);
  return freeze({
    id,
    matcher: freeze({
      kind: rule.matcher.kind,
      requiredTags: freeze(requiredTags),
      forbiddenTags: freeze(forbiddenTags),
    }),
    replacement: freeze({
      footprintMm: freeze(footprintMm),
      portIds: freeze(portIds),
      orientations: freeze(orientations),
      scaleRangeFixed: freeze({ min: scaleMin, max: scaleMax }),
    }),
    priority: rule.priority,
    constraints: freeze({
      ...constraints,
      minSpacingMm,
      maxSlopeBps,
      ...(maxFootprintAreaSqMm === undefined ? {} : { maxFootprintAreaSqMm }),
      ...(validateBounds(constraints.boundsMm)
        ? { boundsMm: validateBounds(constraints.boundsMm) }
        : {}),
    }),
  });
}

function matches(
  rule: StructurePlacementRule,
  candidate: StructurePlacementCandidate
): boolean {
  const tags = new Set(candidate.tags);
  return (
    rule.matcher.kind === candidate.kind &&
    (rule.matcher.requiredTags ?? []).every(tag => tags.has(tag)) &&
    (rule.matcher.forbiddenTags ?? []).every(tag => !tags.has(tag))
  );
}

function candidateRulePairs(
  rules: readonly StructurePlacementRule[],
  candidates: readonly StructurePlacementCandidate[]
): readonly Readonly<{
  candidate: StructurePlacementCandidate;
  rule: StructurePlacementRule | null;
}>[] {
  return candidates
    .map(candidate => {
      const matching = rules
        .filter(rule => matches(rule, candidate))
        .sort(
          (left, right) =>
            right.priority - left.priority || compare(left.id, right.id)
        );
      return freeze({ candidate, rule: matching[0] ?? null });
    })
    .sort(
      (left, right) =>
        (right.rule?.priority ?? -1_000_001) -
          (left.rule?.priority ?? -1_000_001) ||
        compare(left.candidate.candidateId, right.candidate.candidateId) ||
        compare(left.rule?.id ?? "", right.rule?.id ?? "")
    );
}

function placementAabb(
  positionMm: { x: number; z: number },
  footprintMm: { x: number; z: number }
): Aabb {
  return {
    minX: positionMm.x,
    minZ: positionMm.z,
    maxX: positionMm.x + footprintMm.x,
    maxZ: positionMm.z + footprintMm.z,
  };
}
function gap(left: Aabb, right: Aabb): Readonly<{ x: number; z: number }> {
  return {
    x: Math.max(0, Math.max(left.minX - right.maxX, right.minX - left.maxX)),
    z: Math.max(0, Math.max(left.minZ - right.maxZ, right.minZ - left.maxZ)),
  };
}
function overlaps(left: Aabb, right: Aabb): boolean {
  return (
    left.minX < right.maxX &&
    right.minX < left.maxX &&
    left.minZ < right.maxZ &&
    right.minZ < left.maxZ
  );
}
function clearOf(left: Aabb, right: Aabb, spacing: number): boolean {
  const separation = gap(left, right);
  return separation.x >= spacing || separation.z >= spacing;
}
function graphHasRoadEdge(
  input: StructurePlacementInput,
  nodeId: string
): boolean {
  return input.graph.edges.some(
    edge =>
      (edge.kind === "transit" || edge.kind === "reachable") &&
      (edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
  );
}
function selectStream(
  worldSeedHash: string,
  revision: string,
  rulesetHash: string,
  candidateId: string,
  ruleId: string
): bigint {
  const digest = domainSha256(
    `${AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION}:${worldSeedHash}:${revision}:${rulesetHash}:${candidateId}:${ruleId}`,
    []
  ).slice(7, 23);
  return BigInt(`0x${digest}`);
}
function choosePlacement(
  input: StructurePlacementInput,
  candidate: StructurePlacementCandidate,
  rule: StructurePlacementRule,
  stream: bigint
): Readonly<{
  orientation: number;
  scaleFixed: number;
  footprintMm: Readonly<{ x: number; z: number }>;
}> {
  const orientation =
    rule.replacement.orientations[
      Number(stream % BigInt(rule.replacement.orientations.length))
    ]!;
  const range =
    rule.replacement.scaleRangeFixed.max -
    rule.replacement.scaleRangeFixed.min +
    1;
  const scaleFixed =
    rule.replacement.scaleRangeFixed.min +
    Number(
      (stream / BigInt(rule.replacement.orientations.length)) % BigInt(range)
    );
  const rotated = orientation % 2 === 1;
  const base = rotated
    ? { x: rule.replacement.footprintMm.z, z: rule.replacement.footprintMm.x }
    : rule.replacement.footprintMm;
  return freeze({
    orientation,
    scaleFixed,
    footprintMm: freeze({
      x: scaleAxis(base.x, scaleFixed),
      z: scaleAxis(base.z, scaleFixed),
    }),
  });
}
function rejection(
  candidateId: string,
  ruleId: string | null,
  code: StructurePlacementFailureCode,
  detail: string
): StructurePlacementRejection {
  return freeze({ candidateId, ruleId, code, detail });
}

export function compileDeterministicStructurePlacement(
  input: StructurePlacementInput
): StructurePlacementResolution {
  identifier(input.worldId, "worldId");
  if (!SHA256.test(input.worldSeedHash) || !SHA256.test(input.rulesetHash))
    fail("INVALID_HASH", "worldSeedHash/rulesetHash");
  if (
    !REVISION.test(input.worldGenerationRevision) ||
    !REVISION.test(input.sourceRevision)
  )
    fail("INVALID_REVISION", "worldGenerationRevision/sourceRevision");
  if (
    input.rules.length < 1 ||
    input.rules.length > STRUCTURE_PLACEMENT_MAX_RULES
  )
    fail("RULE_BUDGET", "rules");
  if (input.candidates.length > STRUCTURE_PLACEMENT_MAX_CANDIDATES)
    fail("CANDIDATE_BUDGET", "candidates");
  if (
    (input.existingPlacements?.length ?? 0) > STRUCTURE_PLACEMENT_MAX_EXISTING
  )
    fail("EXISTING_BUDGET", "existing placements");
  const maxPlacements =
    input.maxPlacements ?? STRUCTURE_PLACEMENT_MAX_CANDIDATES;
  if (
    !Number.isSafeInteger(maxPlacements) ||
    maxPlacements < 1 ||
    maxPlacements > STRUCTURE_PLACEMENT_MAX_CANDIDATES
  )
    fail("PLACEMENT_BUDGET", "maxPlacements");
  const rules = input.rules
    .map(validateRule)
    .sort(
      (left, right) =>
        right.priority - left.priority || compare(left.id, right.id)
    );
  if (new Set(rules.map(rule => rule.id)).size !== rules.length)
    fail("DUPLICATE_RULE", "rules");
  const candidates = input.candidates.map(candidate => {
    const candidateId = identifier(candidate.candidateId, "candidateId");
    const graphNodeId = identifier(candidate.graphNodeId, "graphNodeId");
    if (!STRUCTURE_PLACEMENT_KINDS.includes(candidate.kind))
      fail("INVALID_KIND", candidateId);
    safeInteger(candidate.positionMm.x, `${candidateId}.position.x`);
    safeInteger(candidate.positionMm.z, `${candidateId}.position.z`);
    boundedBps(candidate.terrainSlopeBps, `${candidateId}.terrainSlopeBps`);
    const tags = [
      ...new Set(candidate.tags.map(tag => identifier(tag, "candidate tag"))),
    ].sort(compare);
    return freeze({
      ...candidate,
      candidateId,
      graphNodeId,
      tags,
      positionMm: freeze({
        x: candidate.positionMm.x,
        z: candidate.positionMm.z,
      }),
    });
  });
  if (
    new Set(candidates.map(candidate => candidate.candidateId)).size !==
    candidates.length
  )
    fail("DUPLICATE_CANDIDATE", "candidates");
  const existing = (input.existingPlacements ?? []).map(value =>
    freeze({
      ...value,
      placementId: identifier(value.placementId, "placementId"),
      positionMm: freeze({ ...value.positionMm }),
      footprintMm: freeze({ ...value.footprintMm }),
    })
  );
  const inputHash = hash({
    protocol: AURION_STRUCTURE_PLACEMENT_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION,
    streamPolicyVersion: AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION,
    worldId: input.worldId,
    worldSeedHash: input.worldSeedHash,
    worldGenerationRevision: input.worldGenerationRevision,
    rulesetHash: input.rulesetHash,
    sourceRevision: input.sourceRevision,
    graph: input.graph,
    rules: rules,
    candidates: candidates,
    existingPlacements: existing,
    maxPlacements,
  });
  const placements: StructurePlacement[] = [];
  const rejections: StructurePlacementRejection[] = [];
  const graphUpdates: StructurePlacementGraphUpdate[] = [];
  let footprintAreaTotal = 0;
  for (const pair of candidateRulePairs(rules, candidates)) {
    const { candidate, rule } = pair;
    if (!rule) {
      rejections.push(
        rejection(
          candidate.candidateId,
          null,
          "CANDIDATE_RULE_NOT_MATCHED",
          "no matcher accepted candidate"
        )
      );
      continue;
    }
    if (
      !input.graph.nodes.some(node => node.nodeId === candidate.graphNodeId)
    ) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "GRAPH_NODE_MISSING",
          candidate.graphNodeId
        )
      );
      continue;
    }
    if (placements.length >= maxPlacements) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "PLACEMENT_BUDGET_EXCEEDED",
          String(maxPlacements)
        )
      );
      continue;
    }
    if (
      rule.constraints.requireRoadConnectivity &&
      (!candidate.roadReachable ||
        !graphHasRoadEdge(input, candidate.graphNodeId))
    ) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "ROAD_CONNECTIVITY_REQUIRED",
          candidate.graphNodeId
        )
      );
      continue;
    }
    if (
      rule.constraints.requireEntranceReachability &&
      !candidate.entranceReachable
    ) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "DUNGEON_ENTRANCE_UNREACHABLE",
          candidate.candidateId
        )
      );
      continue;
    }
    if (candidate.terrainSlopeBps > rule.constraints.maxSlopeBps) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "TERRAIN_SLOPE_EXCEEDED",
          `${candidate.terrainSlopeBps}>${rule.constraints.maxSlopeBps}`
        )
      );
      continue;
    }
    const selected = choosePlacement(
      input,
      candidate,
      rule,
      selectStream(
        input.worldSeedHash,
        input.worldGenerationRevision,
        input.rulesetHash,
        candidate.candidateId,
        rule.id
      )
    );
    const footprintArea = area(selected.footprintMm);
    if (
      rule.constraints.maxFootprintAreaSqMm !== undefined &&
      footprintArea > rule.constraints.maxFootprintAreaSqMm
    ) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "FOOTPRINT_BUDGET_EXCEEDED",
          `${footprintArea}>${rule.constraints.maxFootprintAreaSqMm}`
        )
      );
      continue;
    }
    const aabb = placementAabb(candidate.positionMm, selected.footprintMm);
    const bounds = rule.constraints.boundsMm;
    if (
      bounds &&
      (aabb.minX < bounds.minX ||
        aabb.minZ < bounds.minZ ||
        aabb.maxX > bounds.maxX ||
        aabb.maxZ > bounds.maxZ)
    ) {
      rejections.push(
        rejection(
          candidate.candidateId,
          rule.id,
          "PLACEMENT_BOUNDS_EXCEEDED",
          candidate.candidateId
        )
      );
      continue;
    }
    const prior = [
      ...existing.map(value => ({
        aabb: placementAabb(value.positionMm, value.footprintMm),
        spacing: rule.constraints.minSpacingMm,
      })),
      ...placements.map(value => ({
        aabb: placementAabb(value.positionMm, value.footprintMm),
        spacing: rule.constraints.minSpacingMm,
      })),
    ];
    let blocked = false;
    for (const other of prior) {
      if (!rule.constraints.allowOverlap && overlaps(aabb, other.aabb)) {
        rejections.push(
          rejection(
            candidate.candidateId,
            rule.id,
            "PLACEMENT_OVERLAP",
            candidate.candidateId
          )
        );
        blocked = true;
        break;
      }
      if (!clearOf(aabb, other.aabb, other.spacing)) {
        rejections.push(
          rejection(
            candidate.candidateId,
            rule.id,
            "PLACEMENT_SPACING_INSUFFICIENT",
            candidate.candidateId
          )
        );
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const placementId = `placement:${input.worldId}:${candidate.candidateId}`;
    const placementHash = hash({
      protocol: AURION_STRUCTURE_PLACEMENT_PROTOCOL,
      placementId,
      candidateId: candidate.candidateId,
      ruleId: rule.id,
      kind: candidate.kind,
      graphNodeId: candidate.graphNodeId,
      positionMm: candidate.positionMm,
      footprintMm: selected.footprintMm,
      orientationQuarterTurns: selected.orientation,
      scaleFixed: selected.scaleFixed,
      portIds: rule.replacement.portIds,
    });
    const placement: StructurePlacement = freeze({
      placementId,
      candidateId: candidate.candidateId,
      ruleId: rule.id,
      kind: candidate.kind,
      graphNodeId: candidate.graphNodeId,
      positionMm: freeze({ ...candidate.positionMm }),
      footprintMm: selected.footprintMm,
      orientationQuarterTurns: selected.orientation,
      scaleFixed: selected.scaleFixed,
      portIds: rule.replacement.portIds,
      placementHash,
    });
    placements.push(placement);
    footprintAreaTotal += footprintArea;
    const updateId = `supports:${placementId}:${candidate.graphNodeId}`;
    graphUpdates.push(
      freeze({
        updateId,
        placementId,
        graphNodeId: candidate.graphNodeId,
        kind: "supports",
        updateHash: hash({
          updateId,
          placementId,
          graphNodeId: candidate.graphNodeId,
          kind: "supports",
        }),
      })
    );
  }
  const graphUpdateHash = hash(graphUpdates);
  const resolutionHash = hash({
    protocol: AURION_STRUCTURE_PLACEMENT_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION,
    streamPolicyVersion: AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION,
    inputHash,
    placements,
    rejections,
    graphUpdates,
    footprintAreaTotal,
  });
  const receiptWithoutHash = {
    schema: "aurion.structure-placement-receipt.v1" as const,
    protocol: AURION_STRUCTURE_PLACEMENT_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION,
    worldId: input.worldId,
    worldSeedHash: input.worldSeedHash,
    worldGenerationRevision: input.worldGenerationRevision,
    rulesetHash: input.rulesetHash,
    sourceRevision: input.sourceRevision,
    inputHash,
    resolutionHash,
    graphUpdateHash,
    acceptedPlacementIds: placements.map(value => value.placementId),
    rejectedCandidateIds: rejections.map(value => value.candidateId),
  };
  const receipt = freeze({
    ...receiptWithoutHash,
    receiptHash: hash(receiptWithoutHash),
  });
  return freeze({
    protocol: AURION_STRUCTURE_PLACEMENT_PROTOCOL,
    compilerVersion: AURION_STRUCTURE_PLACEMENT_COMPILER_VERSION,
    streamPolicyVersion: AURION_STRUCTURE_PLACEMENT_STREAM_POLICY_VERSION,
    inputHash,
    placements: freeze(placements),
    rejections: freeze(rejections),
    graphUpdates: freeze(graphUpdates),
    receipt,
    resolutionHash,
    stats: freeze({
      candidatesConsidered: candidates.length,
      placementsAccepted: placements.length,
      candidatesRejected: rejections.length,
    }),
  });
}

export function verifyDeterministicStructurePlacement(
  input: StructurePlacementInput,
  resolution: StructurePlacementResolution
): boolean {
  const replay = compileDeterministicStructurePlacement(input);
  return (
    replay.inputHash === resolution.inputHash &&
    replay.resolutionHash === resolution.resolutionHash &&
    replay.receipt.receiptHash === resolution.receipt.receiptHash
  );
}
