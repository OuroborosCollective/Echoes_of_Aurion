import {
  QuestAdminProposal,
  QuestInstance,
  QuestPlan,
  QuestReceipt,
  QuestReplayReceipt,
  QuestTemplateVersion,
  WorldFact,
} from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';
import { OperationalClock, hostOperationalClock, operationalDate, operationalNow } from '../../shared/operationalClock';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';
import { QuestPersistenceEngine } from './persistence';
import { QuestReplayEngine } from './replay';

export interface AdminQuestStudioStatus {
  compilerVersion: string;
  schemaVersion: string;
  activeTemplateSetHash: string;
  activeTemplatesCount: number;
  worldFactsCount: number;
  worldStateSequence: number;
  totalInstancesCount: number;
  activeInstancesCount: number;
  completedInstancesCount: number;
  quarantinedTemplatesCount: number;
  gameDevStatus: {
    version: string;
    sourceRevision: string;
    available: boolean;
  };
}

/**
 * AIM-298: Admin Quest Studio Service.
 * Provides typed, validated admin application operations for template authoring, graph inspection,
 * instance tracking, and deterministic replay without raw SQL or unvalidated state mutations.
 */
export class AdminQuestStudioService {
  private worldFactEngine: WorldFactEngine;
  private templateRegistry: QuestTemplateRegistry;
  private runtimeEngine: QuestRuntimeEngine;
  private persistenceEngine: QuestPersistenceEngine;
  private replayEngine: QuestReplayEngine;
  private proposals: Map<string, QuestAdminProposal> = new Map();

  constructor(private clock: OperationalClock = hostOperationalClock) {
    this.worldFactEngine = new WorldFactEngine();
    this.templateRegistry = new QuestTemplateRegistry();
    this.runtimeEngine = new QuestRuntimeEngine(this.worldFactEngine, this.templateRegistry, this.clock);
    this.persistenceEngine = new QuestPersistenceEngine();
    this.replayEngine = new QuestReplayEngine(this.templateRegistry, this.clock);

    // Initial seed run for demonstration & testing
    this.seedInitialRun();
  }

  private seedInitialRun() {
    // Record initial event
    this.worldFactEngine.recordEvent({
      id: 'evt_init_caravan',
      type: 'CARAVAN_ATTACKED',
      source: 'aurion_system_seed',
      data: { caravanId: 'caravan_alpha', merchantId: 'npc_merchant_kaelen', playerUserId: '1' },
    });

    // Compile and offer initial quest
    const { instance, plan } = this.runtimeEngine.compileAndOfferQuest({
      worldId: 'world_main',
      playerUserId: 1,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId: 'evt_init_caravan',
    });

    this.persistenceEngine.savePlan(plan);
    this.persistenceEngine.saveInstance(instance);
  }

  public async getStatus(): Promise<AdminQuestStudioStatus> {
    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const instances = await this.persistenceEngine.listInstances();

    return {
      compilerVersion: '1.0.0',
      schemaVersion: 'aurion.quest.v1',
      activeTemplateSetHash: this.templateRegistry.getTemplateSetHash(),
      activeTemplatesCount: activeTemplates.length,
      worldFactsCount: this.worldFactEngine.getFacts().length,
      worldStateSequence: this.worldFactEngine.getLatestSequence(),
      totalInstancesCount: instances.length,
      activeInstancesCount: instances.filter(i => i.state === 'active').length,
      completedInstancesCount: instances.filter(i => i.state === 'completed').length,
      quarantinedTemplatesCount: 0,
      gameDevStatus: {
        version: '1.0.2',
        sourceRevision: '96a0b4f34b979279ab983e9547af43133e85f310',
        available: true,
      },
    };
  }

  public getWorldFacts(): WorldFact[] {
    return this.worldFactEngine.getFacts();
  }

  public getTemplates(): QuestTemplateVersion[] {
    return this.templateRegistry.getActiveTemplates();
  }

  public async listInstances(): Promise<QuestInstance[]> {
    return this.persistenceEngine.listInstances();
  }

  public async replayInstance(instanceId: string): Promise<QuestReplayReceipt> {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) {
      throw new Error(`QUEST_INSTANCE_NOT_FOUND:${instanceId}`);
    }
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) {
      throw new Error(`QUEST_PLAN_NOT_FOUND:${instance.planHash}`);
    }

    const facts = this.worldFactEngine.getFacts();
    return this.replayEngine.replayInstance(instance, plan, facts, instance.planHash);
  }

  public createDraftProposal(params: {
    authorUserId: number;
    templateId: string;
    templateVersion: number;
    proposedDataJson: string;
  }): QuestAdminProposal {
    const proposalSeq = this.proposals.size + 1;
    const proposalIdentity = computeCanonicalHash('aurion.quest.proposal.identity.v1', {
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      proposedDataJson: params.proposedDataJson,
      sequence: proposalSeq,
    });
    const proposalId = `prop_${params.templateId}_v${params.templateVersion}_${proposalIdentity.slice(0, 16)}`;
    const expectedTemplateSetHash = this.templateRegistry.getTemplateSetHash();

    const receiptHash = computeCanonicalHash('aurion.quest.template.v1', {
      id: proposalId,
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      expectedTemplateSetHash,
      proposedDataJson: params.proposedDataJson,
    });

    const proposal: QuestAdminProposal = {
      id: proposalId,
      proposalType: 'create_template_draft',
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      expectedTemplateSetHash,
      proposedDataJson: params.proposedDataJson,
      status: 'draft',
      receiptHash,
      createdAt: operationalDate(this.clock).toISOString(),
    };

    this.proposals.set(proposalId, proposal);
    return proposal;
  }

  public createPublishPlan(proposalId: string): {
    planHash: string;
    template: { templateId: string; version: number };
    templateHash: string;
  } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error("PROPOSAL_NOT_FOUND");
    const planHash = computeCanonicalHash('aurion.quest.plan.v1', {
      proposalId: proposal.id,
      templateId: proposal.templateId,
      templateVersion: proposal.templateVersion,
    });
    return {
      planHash,
      template: {
        templateId: proposal.templateId,
        version: proposal.templateVersion,
      },
      templateHash: proposal.receiptHash,
    };
  }

  public publishProposal(params: {
    proposalId: string;
    expectedPlanHash: string;
  }): {
    receipt: { receiptId: string; receiptHash: string };
    templateSetHash: string;
  } {
    const plan = this.createPublishPlan(params.proposalId);
    if (plan.planHash !== params.expectedPlanHash) {
      throw new Error("PLAN_HASH_MISMATCH");
    }
    const proposal = this.proposals.get(params.proposalId)!;
    proposal.status = 'active';
    const templateSetHash = this.templateRegistry.getTemplateSetHash();
    return {
      receipt: {
        receiptId: `rcpt_${proposal.id}`,
        receiptHash: proposal.receiptHash,
      },
      templateSetHash,
    };
  }

  public async getInstanceDetails(instanceId: string): Promise<{ instance: QuestInstance; plan: QuestPlan }> {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) throw new Error("INSTANCE_NOT_FOUND");
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    return { instance, plan };
  }

  public async offerQuestForPlayer(playerUserId: number, templateId: string): Promise<{ instance: QuestInstance; plan: QuestPlan }> {
    const triggerEventId = computeCanonicalHash('aurion.quest.event.v1', {
      playerUserId,
      templateId,
      tick: operationalNow(this.clock),
    });
    const { instance, plan } = this.runtimeEngine.compileAndOfferQuest({
      worldId: 'world_main',
      playerUserId,
      giverNpcId: 'npc_merchant_kaelen',
      triggerEventId,
    });
    await this.persistenceEngine.savePlan(plan);
    await this.persistenceEngine.saveInstance(instance);
    return { instance, plan };
  }

  public async acceptQuestForPlayer(playerUserId: number, instanceId: string): Promise<{ updatedInstance: QuestInstance; receipt: QuestReceipt }> {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) throw new Error("INSTANCE_NOT_FOUND");
    if (instance.playerUserId !== playerUserId) throw new Error("UNAUTHORIZED");
    const result = this.runtimeEngine.acceptQuest(instance);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    await this.persistenceEngine.saveReceipt(result.receipt);
    return result;
  }

  public async chooseBranchForPlayer(playerUserId: number, instanceId: string, edgeId: string): Promise<{ updatedInstance: QuestInstance }> {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) throw new Error("INSTANCE_NOT_FOUND");
    if (instance.playerUserId !== playerUserId) throw new Error("UNAUTHORIZED");
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    const edge = plan.edges.find(e => e.id === edgeId && e.fromNodeId === instance.currentNodeId);
    if (!edge) throw new Error("INVALID_EDGE_CHOICE");
    const occurredAt = operationalDate(this.clock).toISOString();
    const updatedInstance: QuestInstance = {
      ...instance,
      currentNodeId: edge.toNodeId,
      completedNodeIds: [...instance.completedNodeIds, instance.currentNodeId],
      updatedAt: occurredAt,
    };
    await this.persistenceEngine.saveInstance(updatedInstance);
    return { updatedInstance };
  }

  public async completeQuestForPlayer(playerUserId: number, instanceId: string): Promise<{ updatedInstance: QuestInstance; receipt: QuestReceipt }> {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) throw new Error("INSTANCE_NOT_FOUND");
    if (instance.playerUserId !== playerUserId) throw new Error("UNAUTHORIZED");
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    const result = this.runtimeEngine.completeQuest(instance, plan);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    await this.persistenceEngine.saveReceipt(result.receipt);
    return { updatedInstance: result.updatedInstance, receipt: result.receipt };
  }
}
