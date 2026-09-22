import {
  QuestInstance,
  QuestPlan,
  QuestReceipt,
} from '../../shared/aurionQuestContract';
import { computeCanonicalHash, computeQuestStateHash, computeSeedDigest } from '../../shared/aurionQuestCanonicalHash';
import { OperationalClock, hostOperationalClock, operationalDate } from '../../shared/operationalClock';
import { activeProvenance } from '../aurionProvenance';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { CandidateResolver } from './candidateResolver';
import { RoleResolver } from './roleResolver';
import { QuestComposer } from './composer';
import { QuestValidator } from './validator';
import { QuestDomainCommandSchema, type QuestDomainCommand } from '../../shared/aurionQuestDomainCommandContract';
import type { QuestCompleteSource } from '../../shared/aurionQuestDomainCommandContract';

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
    triggerEventId: string;
    /** Legacy caller compatibility only; production offer routes never control giver binding. */
    giverNpcId?: string;
    requestedTemplateId?: string;
    compilerVersion?: string;
  }): { instance: QuestInstance; plan: QuestPlan } {
    const occurredAt = operationalDate(this.clock).toISOString();
    const compilerVersion = params.compilerVersion || '1.0.0';
    const facts = this.worldFactEngine.getFacts();
    const factsHash = this.worldFactEngine.getFactsHash();
    const worldStateRev = this.worldFactEngine.getLatestSequence();

    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const templateSetHash = this.templateRegistry.getTemplateSetHash();
    const requestedPool = params.requestedTemplateId
      ? activeTemplates.filter(template => template.templateId === params.requestedTemplateId)
      : activeTemplates;
    if (params.requestedTemplateId && requestedPool.length === 0) throw new Error("QUEST_TEMPLATE_NOT_ACTIVE");

    // 1. Resolve eligible candidates & candidate set hash. A player may select
    // among server-confirmed eligible templates, but never supplies seed/event truth.
    const { eligibleTemplates, candidateSetHash } = CandidateResolver.resolveCandidates(requestedPool, facts);
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
    const { boundRoles, roleBindingHash } = RoleResolver.resolveRoles(winningTemplate.roles);
    const giverNpcId = boundRoles.find(role => role.roleName === "giver" && role.entityType === "npc")?.entityId ?? "aurion_system";

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
    const triggerEvent = this.worldFactEngine.getEvents().find(event => event.id === params.triggerEventId);

    const instance: QuestInstance = {
      id: instanceId,
      worldId: params.worldId,
      playerUserId: params.playerUserId,
      giverNpcId,
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
      triggerEventId: params.triggerEventId,
      triggerEventDigest: triggerEvent?.payloadHash,
      compilerVersion,
      sourceRevision: activeProvenance.sourceRevision,
      worldStateRevision: worldStateRev,
      templateSetHash,
      candidateSetHash,
      roleBindingHash,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    return { instance, plan };
  }

  public executeDomainCommand(
    command: QuestDomainCommand,
    instance: QuestInstance,
    plan: QuestPlan,
  ) {
    const parsed = QuestDomainCommandSchema.parse(command);
    const { commandId, ...identityPayload } = parsed;
    const expectedCommandId = computeCanonicalHash('aurion.quest.command.v1', identityPayload);
    if (commandId !== expectedCommandId) {
      throw new Error("QUEST_DOMAIN_COMMAND_IDENTITY_MISMATCH");
    }
    if (parsed.instanceId !== instance.id) {
      throw new Error("QUEST_DOMAIN_COMMAND_INSTANCE_MISMATCH");
    }
    if (parsed.planHash !== instance.planHash || parsed.graphHash !== instance.graphHash) {
      throw new Error("QUEST_DOMAIN_COMMAND_PLAN_MISMATCH");
    }
    if (computeQuestStateHash(instance) !== parsed.expectedStateHash) {
      throw new Error("QUEST_DOMAIN_COMMAND_STALE_STATE");
    }
    if (parsed.kind === "accept" && parsed.eventSequence !== 1) {
      throw new Error("QUEST_DOMAIN_COMMAND_ACCEPT_SEQUENCE_INVALID");
    }

    switch (parsed.kind) {
      case "accept":
        return {
          kind: parsed.kind,
          ...this.acceptQuest(instance, plan, {
            eventSequence: parsed.eventSequence,
            idempotencyKey: parsed.idempotencyKey,
          }),
        } as const;
      case "progress":
        return {
          kind: parsed.kind,
          ...this.progressObjective(instance, plan, parsed.objectiveKey, parsed.amount, {
            eventSequence: parsed.eventSequence,
            idempotencyKey: parsed.idempotencyKey,
          }),
        } as const;
      case "choice":
        return {
          kind: parsed.kind,
          ...this.chooseBranch(instance, plan, parsed.edgeId, {
            eventSequence: parsed.eventSequence,
            idempotencyKey: parsed.idempotencyKey,
          }),
        } as const;
      case "complete":
        return {
          kind: parsed.kind,
          ...this.completeQuest(instance, plan, {
            eventSequence: parsed.eventSequence,
            idempotencyKey: parsed.idempotencyKey,
          }),
        } as const;
    }
  }

  public acceptQuest(
    instance: QuestInstance,
    plan: QuestPlan,
    options?: { eventSequence?: number; idempotencyKey?: string },
  ): { updatedInstance: QuestInstance; receipt: QuestReceipt } {
    if (instance.state !== 'offered') {
      throw new Error(`CANNOT_ACCEPT_QUEST_IN_STATE:${instance.state}`);
    }
    if (plan.planHash !== instance.planHash || plan.graphHash !== instance.graphHash) throw new Error("QUEST_ACCEPT_PLAN_MISMATCH");
    const startNode = plan.nodes.find(node => node.id === instance.currentNodeId);
    if (!startNode || startNode.type !== "start") throw new Error("QUEST_ACCEPT_START_NODE_REQUIRED");
    const outgoing = plan.edges
      .filter(edge => edge.fromNodeId === startNode.id && !edge.conditionPredicate)
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
    if (outgoing.length !== 1) throw new Error("QUEST_ACCEPT_START_EDGE_AMBIGUOUS");

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeQuestStateHash(instance);
    const updatedInstance: QuestInstance = {
      ...instance,
      state: 'active',
      currentNodeId: outgoing[0]!.toNodeId,
      completedNodeIds: instance.completedNodeIds.includes(startNode.id) ? [...instance.completedNodeIds] : [...instance.completedNodeIds, startNode.id],
      updatedAt: occurredAt,
    };

    const resultStateHash = computeQuestStateHash(updatedInstance);

    const receipt: QuestReceipt = {
      id: `rcpt_${instance.id}_accept`,
      instanceId: instance.id,
      eventSequence: options?.eventSequence ?? 1,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: options?.idempotencyKey ?? `accept:${instance.id}`,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, receipt };
  }

  public progressObjective(
    instance: QuestInstance,
    plan: QuestPlan,
    objectiveKey: string,
    amount: number,
    options?: { eventSequence?: number; idempotencyKey?: string }
  ): { updatedInstance: QuestInstance; completedNode: boolean; receipt: QuestReceipt } {
    if (instance.state !== 'active') {
      throw new Error(`CANNOT_PROGRESS_INACTIVE_QUEST:${instance.state}`);
    }

    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000) throw new Error("QUEST_PROGRESS_AMOUNT_INVALID");
    const currentNode = plan.nodes.find(n => n.id === instance.currentNodeId);
    if (!currentNode?.objective || currentNode.objective.key !== objectiveKey) throw new Error("QUEST_OBJECTIVE_KEY_MISMATCH");

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeQuestStateHash(instance);
    const currentProgress = (instance.objectiveProgress[objectiveKey] as number) || 0;
    const newProgress = currentProgress + amount;

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

    const resultStateHash = computeQuestStateHash(updatedInstance);
    const eventSequence = options?.eventSequence ?? instance.completedNodeIds.length + 2;

    const receiptIdentity = computeCanonicalHash(
      'aurion.quest.receipt.identity.v1',
      {
        instanceId: instance.id,
        objectiveKey,
        newProgress,
        eventSequence,
        idempotencyKey: options?.idempotencyKey ?? `progress:${instance.id}:${objectiveKey}:${newProgress}`,
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
      idempotencyKey: options?.idempotencyKey ?? `progress:${instance.id}:${objectiveKey}:${newProgress}`,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, completedNode, receipt };
  }

  public chooseBranch(
    instance: QuestInstance,
    plan: QuestPlan,
    edgeId: string,
    options?: { eventSequence?: number; idempotencyKey?: string }
  ): { updatedInstance: QuestInstance; receipt: QuestReceipt } {
    if (instance.state !== "active") throw new Error(`CANNOT_CHOOSE_INACTIVE_QUEST:${instance.state}`);
    const node = plan.nodes.find(candidate => candidate.id === instance.currentNodeId);
    if (!node || node.type !== "branch") throw new Error("QUEST_BRANCH_NODE_REQUIRED");
    const edge = plan.edges.find(candidate => candidate.id === edgeId && candidate.fromNodeId === node.id);
    if (!edge) throw new Error("QUEST_BRANCH_EDGE_INVALID");
    if (edge.conditionPredicate) throw new Error("QUEST_BRANCH_CONDITION_UNSUPPORTED");

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeQuestStateHash(instance);
    const completedNodeIds = instance.completedNodeIds.includes(node.id)
      ? [...instance.completedNodeIds]
      : [...instance.completedNodeIds, node.id];
    const updatedInstance: QuestInstance = {
      ...instance,
      currentNodeId: edge.toNodeId,
      completedNodeIds,
      updatedAt: occurredAt,
    };
    const resultStateHash = computeQuestStateHash(updatedInstance);
    const eventSequence = options?.eventSequence ?? completedNodeIds.length + 2;
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
      idempotencyKey: options?.idempotencyKey ?? `choice:${instance.id}:${edgeId}`,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };
    return { updatedInstance, receipt };
  }

  public completeQuest(
    instance: QuestInstance,
    plan: QuestPlan,
    options?: { eventSequence?: number; idempotencyKey?: string; source?: QuestCompleteSource }
  ): { updatedInstance: QuestInstance; receipt: QuestReceipt } {
    if (instance.state !== 'active') {
      throw new Error(`CANNOT_COMPLETE_QUEST_IN_STATE:${instance.state}`);
    }

    const occurredAt = operationalDate(this.clock).toISOString();
    const previousStateHash = computeQuestStateHash(instance);
    const updatedInstance: QuestInstance = {
      ...instance,
      state: 'completed',
      updatedAt: occurredAt,
    };

    const resultStateHash = computeQuestStateHash(updatedInstance);

    if (!options?.source) throw new Error("QUEST_CAUSAL_SOURCE_REQUIRED");
    if (
      options.source.sourceRevision !== instance.sourceRevision ||
      options.source.triggerEventId !== instance.triggerEventId ||
      options.source.compilerVersion !== instance.compilerVersion ||
      options.source.templateSetHash !== instance.templateSetHash ||
      options.source.candidateSetHash !== instance.candidateSetHash ||
      options.source.seedDigest !== instance.seedDigest ||
      options.source.roleBindingHash !== instance.roleBindingHash ||
      (instance.worldStateRevision !== undefined && options.source.sourceLogicalRevision !== instance.worldStateRevision)
    ) throw new Error("QUEST_CAUSAL_SOURCE_IDENTITY_MISMATCH");

    const eventSequence = options?.eventSequence ?? instance.completedNodeIds.length + 3;
    const idempotencyKey = options?.idempotencyKey ?? `complete:${instance.id}`;
    const receiptIdentity = computeCanonicalHash('aurion.quest.receipt.identity.v1', {
      instanceId: instance.id,
      eventSequence,
      previousStateHash,
      resultStateHash,
      idempotencyKey,
    });
    const receipt: QuestReceipt = {
      id: `rcpt_${receiptIdentity.slice(0, 24)}`,
      instanceId: instance.id,
      eventSequence,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', { previousStateHash, resultStateHash }),
      createdAt: occurredAt,
    };

    return { updatedInstance, receipt };
  }
}
