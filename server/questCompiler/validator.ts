import { QuestPlan } from '../../shared/aurionQuestContract';

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
