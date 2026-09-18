import {
  QuestInstance,
  QuestPlan,
  QuestReceipt,
  QuestRuntimeEvent,
  WorldEvent,
} from '../../shared/aurionQuestContract';
import { computeCanonicalHash, computeSeedDigest } from '../../shared/aurionQuestCanonicalHash';
import { OperationalClock, hostOperationalClock, operationalDate } from '../../shared/operationalClock';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { CandidateResolver } from './candidateResolver';
import { RoleResolver } from './roleResolver';
import { QuestComposer } from './composer';
import { QuestValidator } from './validator';

/**
 * AIM-298: Aurion Authoritative Quest Runtime Engine.
 * Executes quest creation, objective progress, choices, completion, and atomic receipt generation.
 */
export class QuestRuntimeEngine {
  constructor(
    private worldFactEngine: WorldFactEngine,
    private templateRegistry: QuestTemplateRegistry,
    private clock: OperationalClock = hostOperationalClock
  ) {}

  public compileAndOfferQuest(params: {
    worldId: string;
    playerUserId: number;
    giverNpcId: string;
    triggerEventId: string;
    compilerVersion?: string;
  }): { instance: QuestInstance; plan: QuestPlan } {
    const occurredAt = operationalDate(this.clock).toISOString();
    const compilerVersion = params.compilerVersion || '1.0.0';
    const facts = this.worldFactEngine.getFacts();
    const factsHash = this.worldFactEngine.getFactsHash();
    const worldStateRev = this.worldFactEngine.getLatestSequence();

    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const templateSetHash = this.templateRegistry.getTemplateSetHash();

    // 1. Resolve eligible candidates & candidate set hash
    const { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(activeTemplates, facts);
    if (eligibleTemplates.length === 0) {
      throw new Error('NO_ELIGIBLE_QUEST_TEMPLATES');
    }

    // 2. Compute seed digest
    const seedDigest = computeSeedDigest({
      worldId: params.worldId,
      worldStateRevision: worldStateRev,
      triggerEventId: params.triggerEventId,
      compilerVersion,
      templateSetHash,
      candidateSetHash,
    });

    // 3. Select winning template candidate deterministically
    const winningTemplate = CandidateResolver.selectWinningTemplate(eligibleTemplates, seedDigest);
    if (!winningTemplate) {
      throw new Error('SEED_SELECTION_FAILED');
    }

    // 4. Resolve semantic role bindings against world entities
    const { boundRoles, roleBindingHash } = RoleResolver.resolveRoles(winningTemplate.roles, undefined, params.giverNpcId);

    // 5. Compose QuestPlan / Graph
    const plan = QuestComposer.composePlan({
      template: winningTemplate,
      templateSetHash,
      candidateSetHash,
      seedDigest,
      boundRoles,
      roleBindingHash,
    });

    // 6. Validate plan fail-closed
    const validation = QuestValidator.validatePlan(plan);
    if (!validation.valid) {
      throw new Error(`QUEST_PLAN_VALIDATION_FAILED:${JSON.stringify(validation.diagnostics)}`);
    }

    // 7. Create offered QuestInstance
    const instanceId = `qi_${params.playerUserId}_${winningTemplate.templateId}_${seedDigest.slice(0, 8)}`;

    const startNode = plan.nodes.find(n => n.type === 'start') || plan.nodes[0]!;

    const instance: QuestInstance = {
      id: instanceId,
      worldId: params.worldId,
      playerUserId: params.playerUserId,
      giverNpcId: params.giverNpcId,
      templateId: winningTemplate.templateId,
      templateVersion: winningTemplate.version,
      seedDigest,
      planHash: plan.planHash,
      graphHash: plan.graphHash,
      currentNodeId: startNode.id,
      completedNodeIds: [],
      boundRoles,
      state: 'offered',
      objectiveProgress: {},
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    return { instance, plan };
  }

  public acceptQuest(instance: QuestInstance): { updatedInstance: QuestInstance; receipt: QuestReceipt } {
    if (instance.state !== 'offered') {
      throw new Error(`CANNOT_ACCEPT_QUEST_IN_STATE:${instance.state}`);
    }

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeCanonicalHash('aurion.quest.instance.v1', instance);
    const updatedInstance: QuestInstance = {
      ...instance,
      state: 'active',
      updatedAt: occurredAt,
    };

    const resultStateHash = computeCanonicalHash('aurion.quest.instance.v1', updatedInstance);

    const receipt: QuestReceipt = {
      id: `rcpt_${instance.id}_accept`,
      instanceId: instance.id,
      eventSequence: 1,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: `accept:${instance.id}`,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, receipt };
  }

  public progressObjective(
    instance: QuestInstance,
    plan: QuestPlan,
    objectiveKey: string,
    amount: number
  ): { updatedInstance: QuestInstance; completedNode: boolean; receipt: QuestReceipt } {
    if (instance.state !== 'active') {
      throw new Error(`CANNOT_PROGRESS_INACTIVE_QUEST:${instance.state}`);
    }

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeCanonicalHash('aurion.quest.instance.v1', instance);
    const currentProgress = (instance.objectiveProgress[objectiveKey] as number) || 0;
    const newProgress = currentProgress + amount;

    const currentNode = plan.nodes.find(n => n.id === instance.currentNodeId);
    let completedNode = false;
    let nextNodeId = instance.currentNodeId;
    const completedNodeIds = [...instance.completedNodeIds];

    if (currentNode && currentNode.objective) {
      const target = (currentNode.objective.targetValue as number) || 1;
      if (newProgress >= target) {
        completedNode = true;
        completedNodeIds.push(currentNode.id);
        const outgoingEdge = plan.edges.find(e => e.fromNodeId === currentNode.id);
        if (outgoingEdge) {
          nextNodeId = outgoingEdge.toNodeId;
        }
      }
    }

    const updatedInstance: QuestInstance = {
      ...instance,
      currentNodeId: nextNodeId,
      completedNodeIds,
      objectiveProgress: {
        ...instance.objectiveProgress,
        [objectiveKey]: newProgress,
      },
      updatedAt: occurredAt,
    };

    const resultStateHash = computeCanonicalHash('aurion.quest.instance.v1', updatedInstance);
    const eventSequence = instance.completedNodeIds.length + 2;

    const receiptIdentity = computeCanonicalHash(
      'aurion.quest.receipt.identity.v1',
      {
        instanceId: instance.id,
        objectiveKey,
        newProgress,
        eventSequence,
        previousStateHash,
        resultStateHash,
      }
    );

    const receipt: QuestReceipt = {
      id: `rcpt_${receiptIdentity.slice(0, 24)}`,
      instanceId: instance.id,
      eventSequence,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: `progress:${instance.id}:${objectiveKey}:${newProgress}`,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, completedNode, receipt };
  }

  public chooseBranch(
    instance: QuestInstance,
    plan: QuestPlan,
    edgeId: string
  ): { updatedInstance: QuestInstance; receipt: QuestReceipt } {
    if (instance.state !== "active") throw new Error(`CANNOT_CHOOSE_INACTIVE_QUEST:${instance.state}`);
    const node = plan.nodes.find(candidate => candidate.id === instance.currentNodeId);
    if (!node || node.type !== "branch") throw new Error("QUEST_BRANCH_NODE_REQUIRED");
    const edge = plan.edges.find(candidate => candidate.id === edgeId && candidate.fromNodeId === node.id);
    if (!edge) throw new Error("QUEST_BRANCH_EDGE_INVALID");
    if (edge.conditionPredicate) throw new Error("QUEST_BRANCH_CONDITION_UNSUPPORTED");

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeCanonicalHash("aurion.quest.instance.v1", instance);
    const completedNodeIds = instance.completedNodeIds.includes(node.id)
      ? [...instance.completedNodeIds]
      : [...instance.completedNodeIds, node.id];
    const updatedInstance: QuestInstance = {
      ...instance,
      currentNodeId: edge.toNodeId,
      completedNodeIds,
      updatedAt: occurredAt,
    };
    const resultStateHash = computeCanonicalHash("aurion.quest.instance.v1", updatedInstance);
    const eventSequence = completedNodeIds.length + 2;
    const receiptIdentity = computeCanonicalHash("aurion.quest.receipt.identity.v1", {
      instanceId: instance.id,
      edgeId,
      eventSequence,
      previousStateHash,
      resultStateHash,
    });
    const receipt: QuestReceipt = {
      id: `rcpt_${receiptIdentity.slice(0, 24)}`,
      instanceId: instance.id,
      eventSequence,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: `choice:${instance.id}:${edgeId}`,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };
    return { updatedInstance, receipt };
  }

  public completeQuest(
    instance: QuestInstance,
    plan: QuestPlan
  ): { updatedInstance: QuestInstance; receipt: QuestReceipt; emittedWorldEvent: WorldEvent } {
    if (instance.state !== 'active') {
      throw new Error(`CANNOT_COMPLETE_QUEST_IN_STATE:${instance.state}`);
    }

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeCanonicalHash('aurion.quest.instance.v1', instance);
    const updatedInstance: QuestInstance = {
      ...instance,
      state: 'completed',
      updatedAt: occurredAt,
    };

    const resultStateHash = computeCanonicalHash('aurion.quest.instance.v1', updatedInstance);

    // Apply outcomes & emit canonical WorldEvent
    const primaryOutcome = plan.outcomes[0];
    const { event } = this.worldFactEngine.recordEvent({
      id: `evt_quest_complete_${instance.id}`,
      type: 'QUEST_COMPLETED_REVENGE',
      source: 'aurion_quest_runtime',
      data: {
        instanceId: instance.id,
        playerUserId: String(instance.playerUserId),
        merchantId: 'merchant_kaelen',
        semanticFlag: primaryOutcome?.semanticFlag || 'completed',
      },
    });

    const receipt: QuestReceipt = {
      id: `rcpt_${instance.id}_complete`,
      instanceId: instance.id,
      eventSequence: instance.completedNodeIds.length + 3,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: `complete:${instance.id}`,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, receipt, emittedWorldEvent: event };
  }
}
