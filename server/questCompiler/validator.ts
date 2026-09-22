import { QuestPlan, QuestTemplateVersion, QuestTemplateVersionSchema } from '../../shared/aurionQuestContract';

export interface ValidationDiagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface QuestValidationResult {
  valid: boolean;
  planHash: string;
  diagnostics: ValidationDiagnostic[];
}

/**
 * AIM-298: Aurion Quest Graph Validator.
 * Performs fail-closed validation of QuestPlans before activation or live instantiation.
 */
export class QuestValidator {
  public static validateTemplate(raw: QuestTemplateVersion): { valid: boolean; diagnostics: ValidationDiagnostic[] } {
    const parse = QuestTemplateVersionSchema.safeParse(raw);
    if (!parse.success) {
      return {
        valid: false,
        diagnostics: parse.error.errors.map(err => ({
          code: "SCHEMA_VALIDATION_ERROR",
          message: `${err.path.join(".")}: ${err.message}`,
          severity: "error" as const,
        })),
      };
    }
    const template = parse.data;
    const diagnostics: ValidationDiagnostic[] = [];
    const ids = template.nodes.map(node => node.id);
    const idSet = new Set(ids);
    if (idSet.size !== ids.length) diagnostics.push({ code: "DUPLICATE_NODE_ID", message: "Quest template contains duplicate node ids.", severity: "error" });
    const starts = template.nodes.filter(node => node.type === "start");
    const ends = template.nodes.filter(node => node.type === "end");
    if (starts.length !== 1) diagnostics.push({ code: "START_NODE_COUNT", message: "Quest template must contain exactly one start node.", severity: "error" });
    if (ends.length < 1) diagnostics.push({ code: "MISSING_END_NODE", message: "Quest template must contain at least one end node.", severity: "error" });
    if (template.nodes.length > 50) diagnostics.push({ code: "NODE_COUNT_EXCEEDED", message: "Quest template exceeds 50 nodes.", severity: "error" });
    const edgeIds = template.edges.map(edge => edge.id);
    if (new Set(edgeIds).size !== edgeIds.length) diagnostics.push({ code: "DUPLICATE_EDGE_ID", message: "Quest template contains duplicate edge ids.", severity: "error" });
    for (const edge of template.edges) {
      if (!idSet.has(edge.fromNodeId) || !idSet.has(edge.toNodeId) || edge.fromNodeId === edge.toNodeId) diagnostics.push({ code: "INVALID_EDGE_REFERENCE", message: `Invalid quest edge ${edge.id}.`, severity: "error" });
    }
    if (starts.length === 1) {
      const visited = new Set<string>();
      const queue = [starts[0]!.id];
      while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const edge of template.edges.filter(candidate => candidate.fromNodeId === current)) if (!visited.has(edge.toNodeId)) queue.push(edge.toNodeId);
      }
      for (const node of template.nodes) if (!visited.has(node.id)) diagnostics.push({ code: "UNREACHABLE_NODE", message: `Quest node ${node.id} is unreachable.`, severity: "error" });
    }
    for (const node of template.nodes) {
      if (node.type === "objective" && !node.objective?.eventBinding) {
        diagnostics.push({ code: "OBJECTIVE_EVENT_BINDING_REQUIRED", message: `Quest objective ${node.id} has no confirmed Aurion event binding.`, severity: "error" });
      }
    }

    // Role definitions check
    if (!template.roles || template.roles.length === 0) {
      diagnostics.push({ code: "MISSING_ROLES", message: "Quest template must define at least one role.", severity: "error" });
    }

    // Cycle detection (DAG check)
    const adj = new Map<string, string[]>();
    for (const node of template.nodes) adj.set(node.id, []);
    for (const edge of template.edges) {
      if (adj.has(edge.fromNodeId)) adj.get(edge.fromNodeId)!.push(edge.toNodeId);
    }
    const color = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
    let hasCycle = false;
    const dfs = (u: string) => {
      color.set(u, 1);
      for (const v of adj.get(u) || []) {
        const c = color.get(v) || 0;
        if (c === 1) {
          hasCycle = true;
          return;
        }
        if (c === 0) {
          dfs(v);
          if (hasCycle) return;
        }
      }
      color.set(u, 2);
    };
    for (const node of template.nodes) {
      if ((color.get(node.id) || 0) === 0) {
        dfs(node.id);
        if (hasCycle) break;
      }
    }
    if (hasCycle) {
      diagnostics.push({ code: "CYCLE_DETECTED", message: "Quest graph contains a cycle.", severity: "error" });
    }

    const outcomeIds = template.outcomes.map(outcome => outcome.id);
    if (new Set(outcomeIds).size !== outcomeIds.length) diagnostics.push({ code: "DUPLICATE_OUTCOME_ID", message: "Quest template contains duplicate outcome ids.", severity: "error" });
    for (const outcome of template.outcomes) for (const reward of outcome.rewards) {
      if (reward.amount > 1_000_000) diagnostics.push({ code: "REWARD_BOUND_EXCEEDED", message: `Reward ${reward.type} exceeds the authoring limit.`, severity: "error" });
    }
    return { valid: !diagnostics.some(item => item.severity === "error"), diagnostics };
  }

  public static validatePlan(plan: QuestPlan): QuestValidationResult {
    const diagnostics: ValidationDiagnostic[] = [];

    // 1. Check start node existence
    const startNodes = plan.nodes.filter(n => n.type === 'start');
    if (startNodes.length === 0) {
      diagnostics.push({
        code: 'MISSING_START_NODE',
        message: 'Quest graph has no start node.',
        severity: 'error',
      });
    }

    // 2. Check end node / outcome existence
    const endNodes = plan.nodes.filter(n => n.type === 'end' || n.type === 'objective');
    if (endNodes.length === 0) {
      diagnostics.push({
        code: 'MISSING_END_NODE',
        message: 'Quest graph has no end or objective nodes.',
        severity: 'error',
      });
    }

    // 3. Node count bounds
    if (plan.nodes.length > 50) {
      diagnostics.push({
        code: 'NODE_COUNT_EXCEEDED',
        message: `Quest node count (${plan.nodes.length}) exceeds maximum allowable limit (50).`,
        severity: 'error',
      });
    }

    // 4. Reachability check from start node via BFS
    const nodeMap = new Map(plan.nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const queue = startNodes.map(s => s.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const outgoingEdges = plan.edges.filter(e => e.fromNodeId === currentId);
      for (const edge of outgoingEdges) {
        if (nodeMap.has(edge.toNodeId) && !visited.has(edge.toNodeId)) {
          queue.push(edge.toNodeId);
        }
      }
    }

    // Ensure all objective/end nodes are reachable
    for (const endNode of endNodes) {
      if (!visited.has(endNode.id)) {
        diagnostics.push({
          code: 'UNREACHABLE_NODE',
          message: `Node ${endNode.id} (${endNode.title}) is unreachable from start node.`,
          severity: 'error',
        });
      }
    }

    // 5. Check role bindings
    if (plan.boundRoles.length === 0) {
      diagnostics.push({
        code: 'EMPTY_ROLE_BINDINGS',
        message: 'Plan has zero bound roles.',
        severity: 'warning',
      });
    }

    // 6. Check outcomes and validate against undeclared effects
    if (!plan.outcomes || plan.outcomes.length === 0) {
      diagnostics.push({
        code: 'MISSING_OUTCOMES',
        message: 'Quest plan must contain at least one outcome.',
        severity: 'error',
      });
    } else {
      const outcomeIds = plan.outcomes.map(o => o.id);
      if (new Set(outcomeIds).size !== outcomeIds.length) {
        diagnostics.push({
          code: 'DUPLICATE_OUTCOME_ID',
          message: 'Quest plan contains duplicate outcome ids.',
          severity: 'error',
        });
      }

      const ALLOWED_EFFECT_TYPES = new Set(['assert_fact', 'retract_fact', 'emit_event', 'grant_reward']);
      const ALLOWED_REWARD_TYPES = new Set(['xp', 'gold', 'item', 'reputation', 'standing']);

      for (const outcome of plan.outcomes) {
        for (const reward of outcome.rewards) {
          if (!ALLOWED_REWARD_TYPES.has(reward.type)) {
            diagnostics.push({
              code: 'UNDECLARED_EFFECT',
              message: `Undeclared reward type: ${reward.type}`,
              severity: 'error',
            });
          }
          if (reward.amount <= 0 || reward.amount > 1_000_000) {
            diagnostics.push({
              code: 'REWARD_BOUND_EXCEEDED',
              message: `Reward ${reward.type} has invalid amount ${reward.amount}.`,
              severity: 'error',
            });
          }
        }
        for (const effect of outcome.factEffects) {
          if (!ALLOWED_EFFECT_TYPES.has(effect.effectType)) {
            diagnostics.push({
              code: 'UNDECLARED_EFFECT',
              message: `Undeclared effect type: ${effect.effectType}`,
              severity: 'error',
            });
          }
          if ((effect.effectType === 'assert_fact' || effect.effectType === 'retract_fact') && (!effect.targetSubject || !effect.predicate)) {
            diagnostics.push({
              code: 'MISSING_AUTHORITATIVE_HANDLER',
              message: `Missing subject or predicate for fact effect ${effect.effectType}.`,
              severity: 'error',
            });
          }
        }
      }

      for (const node of plan.nodes) {
        const allNodeEffects = [...(node.actionsOnEnter || []), ...(node.actionsOnExit || [])];
        for (const effect of allNodeEffects) {
          if (!ALLOWED_EFFECT_TYPES.has(effect.effectType)) {
            diagnostics.push({
              code: 'UNDECLARED_EFFECT',
              message: `Undeclared node action effect type: ${effect.effectType}`,
              severity: 'error',
            });
          }
          if ((effect.effectType === 'assert_fact' || effect.effectType === 'retract_fact') && (!effect.targetSubject || !effect.predicate)) {
            diagnostics.push({
              code: 'MISSING_AUTHORITATIVE_HANDLER',
              message: `Missing subject or predicate for node effect ${effect.effectType}.`,
              severity: 'error',
            });
          }
        }
      }
    }

    const hasErrors = diagnostics.some(d => d.severity === 'error');

    return {
      valid: !hasErrors,
      planHash: plan.planHash,
      diagnostics,
    };
  }
}
