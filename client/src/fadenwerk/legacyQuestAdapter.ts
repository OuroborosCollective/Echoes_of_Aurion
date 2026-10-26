/** Fadenwerk is an untrusted authoring format; Aurion owns all gameplay truth. */
import type { QuestTemplateVersion } from "../../../shared/aurionQuestContract";

export type LegacyIssue = Readonly<{ code: string; path: string; severity: "blocker" | "note"; message: string }>;
export type LegacyChoice = Readonly<{ id: string; label: string; nextNode: string }>;
export type LegacyNode = Readonly<{ id: string; title: string; choices: readonly LegacyChoice[]; narrativeKey?: string }>;
export type LegacyQuestline = Readonly<{
  id: string; title: string; entryNode: string; nodes: readonly LegacyNode[];
  issues: readonly LegacyIssue[];
}>;

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
function fail(code: string, where: string): never { throw new Error(code + ": " + where); }
function obj(v: unknown, where: string): Record<string, unknown> {
  if (!object(v)) fail("DOCUMENT_INVALID", where);
  return v;
}
function ident(v: unknown, where: string): string {
  if (typeof v !== "string" || !ID.test(v)) fail("INVALID_ID", where);
  return v;
}
function label(v: unknown, where: string): string {
  if (typeof v !== "string" || !v.trim() || v.length > 160) fail("INVALID_TITLE", where);
  return v.trim();
}
function issue(list: LegacyIssue[], code: string, path: string, message: string, severity: "blocker" | "note" = "blocker"): void {
  list.push({ code, path, message, severity });
}
function extras(value: Record<string, unknown>, allowed: readonly string[], path: string, list: LegacyIssue[]): void {
  for (const field of Object.keys(value).sort()) {
    if (!allowed.includes(field)) issue(list, "UNMAPPED_FIELD", path + "." + field, "Nicht zugeordnetes Feld: " + field);
  }
}
function unknownContent(value: unknown, list: LegacyIssue[], code: string, path: string): void {
  if (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "") {
    issue(list, code, path, "Quellsemantik ist nicht an Aurions kanonische Verträge gebunden.");
  }
}

/** Inspect the actual Fadenwerk graph. Never fill missing values with demo content. */
export function inspectFadenwerk(input: unknown): { questlines: LegacyQuestline[]; issues: LegacyIssue[] } {
  const root = obj(input, "root");
  if (!Array.isArray(root.questlines)) fail("QUESTLINES_INVALID", "root.questlines");
  if (root.questlines.length < 1 || root.questlines.length > 100) fail("QUESTLINES_EMPTY_OR_EXCESSIVE", "root.questlines");
  if (root.version !== undefined && root.version !== 1) fail("VERSION_UNSUPPORTED", "root.version");
  const rootIssues: LegacyIssue[] = [];
  extras(root, ["version","questlines","seed","items","itemsSource","treasureClasses","generators","npcs","placements"], "root", rootIssues);
  if (root.seed !== undefined) issue(rootIssues, "WORLD_SEED_NOT_IMPORTED", "root.seed", "Ein Browser-Seed ist keine Aurion-Seed-Autorität.", "note");
  for (const field of ["items","treasureClasses","generators","npcs","placements"]) {
    unknownContent(root[field], rootIssues, "EXTERNAL_CATALOG_NOT_IMPORTED", "root." + field);
  }
  const questlines: LegacyQuestline[] = [];
  const lineIds = new Set<string>();
  for (let i = 0; i < root.questlines.length; i++) {
    const base = "questlines[" + i + "]";
    const raw = obj(root.questlines[i], base);
    const lineId = ident(raw.id, base + ".id");
    if (lineIds.has(lineId)) fail("DUPLICATE_QUESTLINE", base);
    lineIds.add(lineId);
    const entryNode = ident(raw.entryNode, base + ".entryNode");
    const lineIssues = [...rootIssues];
    extras(raw, ["id","title","entryNode","graph","strandKey","description"], base, lineIssues);
    if (raw.strandKey !== undefined && raw.strandKey !== "") {
      issue(lineIssues, "STRAND_IS_PRESENTATION_ONLY", base + ".strandKey", "Die Strangkennung begründet keine Fraktionszugehörigkeit.", "note");
    }
    const graph = obj(raw.graph, base + ".graph");
    const keys = Object.keys(graph).sort();
    if (!keys.length || keys.length > 50) fail("NODE_COUNT_INVALID", base);
    if (!Object.hasOwn(graph, entryNode)) fail("MISSING_ENTRY_NODE", base);
    const nodes: LegacyNode[] = [];
    for (const key of [entryNode, ...keys.filter(k => k !== entryNode)]) {
      const path = base + ".graph." + key;
      ident(key, path);
      const node = obj(graph[key], path);
      if (node.id !== key) fail("NODE_ID_MISMATCH", path);
      extras(node, ["id","title","choices","narrativeKey","text","featureTriggers","rewards"], path, lineIssues);
      unknownContent(node.text, lineIssues, "UNMAPPED_NARRATIVE", path + ".text");
      unknownContent(node.featureTriggers, lineIssues, "UNMAPPED_TRIGGER", path + ".featureTriggers");
      unknownContent(node.rewards, lineIssues, "UNMAPPED_REWARD", path + ".rewards");
      const choices = node.choices === undefined ? [] : node.choices;
      if (!Array.isArray(choices)) fail("CHOICES_INVALID", path);
      if (choices.length > 16) fail("CHOICE_COUNT_EXCESSIVE", path);
      const ids = new Set<string>();
      const parsed: LegacyChoice[] = choices.map((choice, index) => {
        const place = path + ".choices[" + index + "]";
        const c = obj(choice, place);
        const choiceId = ident(c.id, place + ".id");
        if (ids.has(choiceId)) fail("DUPLICATE_CHOICE", place);
        ids.add(choiceId);
        extras(c, ["id","label","nextNode","requiresFlags"], place, lineIssues);
        unknownContent(c.requiresFlags, lineIssues, "UNMAPPED_FLAG", place + ".requiresFlags");
        return { id: choiceId, label: label(c.label, place + ".label"), nextNode: ident(c.nextNode, place + ".nextNode") };
      });
      const narrativeKey = node.narrativeKey === undefined ? undefined : ident(node.narrativeKey, path + ".narrativeKey");
      nodes.push({ id: key, title: label(node.title, path + ".title"), choices: parsed, ...(narrativeKey ? { narrativeKey } : {}) });
    }
    const graphNodes = new Map(nodes.map(n => [n.id, n] as const));
    for (const node of nodes) for (const choice of node.choices) {
      if (!graphNodes.has(choice.nextNode)) fail("DANGLING_EDGE", base + "." + node.id + "." + choice.id);
    }
    const visited = new Set<string>();
    const active = new Set<string>();
    const walk = (key: string): void => {
      if (active.has(key)) fail("GRAPH_CYCLE", base + ".graph." + key);
      if (visited.has(key)) return;
      active.add(key);
      for (const choice of graphNodes.get(key)!.choices) walk(choice.nextNode);
      active.delete(key);
      visited.add(key);
    };
    walk(entryNode);
    if (visited.size !== nodes.length) fail("UNREACHABLE_NODE", base);
    if (!nodes.some(n => n.choices.length === 0)) fail("MISSING_TERMINAL_NODE", base);
    questlines.push({ id: lineId, title: label(raw.title, base + ".title"), entryNode, nodes, issues: lineIssues });
  }
  return { questlines, issues: questlines.flatMap(q => q.issues) };
}

/** Only lossless graph structures convert; no rewards, flags or events are invented. */
export function toQuarantinedQuestTemplate(line: LegacyQuestline, version: number): QuestTemplateVersion {
  if (line.issues.some(i => i.severity === "blocker")) throw new Error("FADENWERK_UNMAPPED");
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("INVALID_TEMPLATE_VERSION");
  const ids = new Set<string>();
  const edges = line.nodes.flatMap(node => node.choices.map(c => {
    const id = "edge_" + node.id + "_" + c.id;
    if (ids.has(id)) throw new Error("DUPLICATE_EDGE_ID");
    ids.add(id);
    return { id, fromNodeId: node.id, toNodeId: c.nextNode, choiceLabel: c.label, priority: 0 };
  }));
  return {
    templateId: "fadenwerk_" + line.id, version, title: line.title,
    description: "Fadenwerk-Strukturimport: inaktiv und quarantänisiert, ohne erfundene Gameplay-Semantik.",
    prerequisiteFacts: [], roles: [],
    nodes: line.nodes.map(n => ({
      id: n.id, title: n.title,
      type: n.id === line.entryNode ? "start" as const : n.choices.length === 0 ? "end" as const : "branch" as const,
      requirements: [], actionsOnEnter: [], actionsOnExit: [],
      ...(n.narrativeKey ? { narrativeKey: n.narrativeKey } : {}),
    })),
    edges, outcomes: [], maxCompositionDepth: line.nodes.length,
    active: false, quarantined: true,
  };
}
export function nextAuthoringVersion(template: QuestTemplateVersion): QuestTemplateVersion {
  if (!Number.isSafeInteger(template.version) || template.version >= Number.MAX_SAFE_INTEGER) throw new Error("TEMPLATE_VERSION_OVERFLOW");
  return { ...structuredClone(template), version: template.version + 1, active: false, quarantined: true };
}
