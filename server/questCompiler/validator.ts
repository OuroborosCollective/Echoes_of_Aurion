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
    const template = QuestTemplateVersionSchema.parse(raw);
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

    const hasErrors = diagnostics.some(d => d.severity === 'error');

    return {
      valid: !hasErrors,
      planHash: plan.planHash,
      diagnostics,
    };
  }
}
