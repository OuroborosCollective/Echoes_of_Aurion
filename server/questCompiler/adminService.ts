import {
  QuestAdminProposalSchema,
  QuestTemplateVersionSchema,
  type QuestAdminProposal,
  type QuestInstance,
  type QuestReplayReceipt,
  type QuestTemplateVersion,
  type WorldFact,
} from "../../shared/aurionQuestContract";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
import { QuestPublishPlanSchema, type AuthoringReceipt, type QuestPublishPlan } from "../../shared/aurionAuthoringContract";
import { OperationalClock, hostOperationalClock, operationalDate } from "../../shared/operationalClock";
import { WorldFactEngine } from "./worldFacts";
import { QuestTemplateRegistry } from "./templateRegistry";
import { QuestRuntimeEngine } from "./runtime";
import { QuestPersistenceEngine } from "./persistence";
import { QuestReplayEngine } from "./replay";
import { QuestValidator } from "./validator";
import { CandidateResolver } from "./candidateResolver";
import { authoringHash, createQuestPublishReceipt } from "../aurionAuthoringPersistence";

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

export class AdminQuestStudioService {
  private readonly worldFactEngine: WorldFactEngine;
  private readonly templateRegistry: QuestTemplateRegistry;
  private readonly runtimeEngine: QuestRuntimeEngine;
  private readonly persistenceEngine: QuestPersistenceEngine;
  private readonly replayEngine: QuestReplayEngine;
  private hydrated = false;

  constructor(private clock: OperationalClock = hostOperationalClock) {
    this.worldFactEngine = new WorldFactEngine();
    this.templateRegistry = new QuestTemplateRegistry();
    this.runtimeEngine = new QuestRuntimeEngine(this.worldFactEngine, this.templateRegistry, this.clock);
    this.persistenceEngine = new QuestPersistenceEngine();
    this.replayEngine = new QuestReplayEngine(this.templateRegistry, this.clock);
    this.seedInitialRun();
  }

  private seedInitialRun(): void {
    this.worldFactEngine.recordEvent({
      id: "evt_init_caravan",
      type: "CARAVAN_ATTACKED",
      source: "aurion_system_seed",
      data: { caravanId: "caravan_alpha", merchantId: "npc_merchant_kaelen", playerUserId: "1" },
    });
    const { instance, plan } = this.runtimeEngine.compileAndOfferQuest({
      worldId: "world_main",
      playerUserId: 1,
      giverNpcId: "npc_merchant_kaelen",
      triggerEventId: "evt_init_caravan",
    });
    this.persistenceEngine.seedEphemeral(plan, instance);
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    const stored = await this.persistenceEngine.listTemplateVersions();
    for (const template of stored) this.templateRegistry.registerTemplate(template);
    this.hydrated = true;
  }

  public async getStatus(): Promise<AdminQuestStudioStatus> {
    await this.ensureHydrated();
    const activeTemplates = this.templateRegistry.getActiveTemplates();
    const instances = await this.persistenceEngine.listInstances();
    return {
      compilerVersion: "1.0.0",
      schemaVersion: "aurion.quest.v1",
      activeTemplateSetHash: this.templateRegistry.getTemplateSetHash(),
      activeTemplatesCount: activeTemplates.length,
      worldFactsCount: this.worldFactEngine.getFacts().length,
      worldStateSequence: this.worldFactEngine.getLatestSequence(),
      totalInstancesCount: instances.length,
      activeInstancesCount: instances.filter(i => i.state === "active").length,
      completedInstancesCount: instances.filter(i => i.state === "completed").length,
      quarantinedTemplatesCount: (await this.persistenceEngine.listTemplateVersions()).filter(item => item.quarantined).length,
      gameDevStatus: {
        version: "1.0.2",
        sourceRevision: "96a0b4f34b979279ab983e9547af43133e85f310",
        available: true,
      },
    };
  }

  public getWorldFacts(): WorldFact[] {
    return this.worldFactEngine.getFacts();
  }

  public async getTemplates(): Promise<QuestTemplateVersion[]> {
    await this.ensureHydrated();
    return this.templateRegistry.getActiveTemplates();
  }

  public async listInstances(filter?: { playerUserId?: number; state?: string }): Promise<QuestInstance[]> {
    return this.persistenceEngine.listInstances(filter);
  }

  public async replayInstance(instanceId: string): Promise<QuestReplayReceipt> {
    await this.ensureHydrated();
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance) throw new Error(`QUEST_INSTANCE_NOT_FOUND:${instanceId}`);
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error(`QUEST_PLAN_NOT_FOUND:${instance.planHash}`);
    return this.replayEngine.replayInstance(instance, plan, this.worldFactEngine.getFacts(), instance.planHash);
  }

  public async createDraftProposal(params: {
    authorUserId: number;
    templateId: string;
    templateVersion: number;
    proposedDataJson: string;
  }): Promise<QuestAdminProposal> {
    await this.ensureHydrated();
    const proposalIdentity = computeCanonicalHash("aurion.quest.proposal.identity.v1", {
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      proposedDataJson: params.proposedDataJson,
      expectedTemplateSetHash: this.templateRegistry.getTemplateSetHash(),
    });
    const proposalId = `prop_${params.templateId}_v${params.templateVersion}_${proposalIdentity.slice(0, 16)}`;
    const expectedTemplateSetHash = this.templateRegistry.getTemplateSetHash();
    const receiptHash = computeCanonicalHash("aurion.quest.template.v1", {
      id: proposalId,
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      expectedTemplateSetHash,
      proposedDataJson: params.proposedDataJson,
    });
    const proposal = QuestAdminProposalSchema.parse({
      id: proposalId,
      proposalType: "create_template_draft",
      authorUserId: params.authorUserId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      expectedTemplateSetHash,
      proposedDataJson: params.proposedDataJson,
      status: "draft",
      receiptHash,
      createdAt: operationalDate(this.clock).toISOString(),
    });
    await this.persistenceEngine.saveProposal(proposal);
    return proposal;
  }

  public async planPublishProposal(proposalId: string): Promise<QuestPublishPlan> {
    await this.ensureHydrated();
    const proposal = await this.persistenceEngine.getProposal(proposalId);
    if (!proposal || proposal.status !== "draft") throw new Error("QUEST_PROPOSAL_NOT_PUBLISHABLE");
    const currentTemplateSetHash = this.templateRegistry.getTemplateSetHash();
    if (proposal.expectedTemplateSetHash !== currentTemplateSetHash) throw new Error("QUEST_TEMPLATE_SET_CHANGED");
    let template: QuestTemplateVersion;
    try {
      template = QuestTemplateVersionSchema.parse(JSON.parse(proposal.proposedDataJson));
    } catch {
      throw new Error("QUEST_PROPOSAL_TEMPLATE_INVALID");
    }
    if (template.templateId !== proposal.templateId || template.version !== proposal.templateVersion) throw new Error("QUEST_PROPOSAL_TEMPLATE_IDENTITY_MISMATCH");
    const validation = QuestValidator.validateTemplate(template);
    if (!validation.valid) throw new Error(`QUEST_TEMPLATE_VALIDATION_FAILED:${JSON.stringify(validation.diagnostics)}`);
    const templateHash = computeCanonicalHash("aurion.quest.template.v1", template);
    const identity = {
      schemaVersion: "aurion.authoring.v1" as const,
      proposalId: proposal.id,
      expectedTemplateSetHash: currentTemplateSetHash,
      proposalReceiptHash: proposal.receiptHash,
      template,
      templateHash,
      requiresHumanConfirmation: true as const,
    };
    return QuestPublishPlanSchema.parse({ ...identity, planHash: authoringHash(identity) });
  }

  public async publishProposal(actorUserId: number, proposalId: string, expectedPlanHash: string): Promise<{
    receipt: AuthoringReceipt;
    templateSetHash: string;
    template: QuestTemplateVersion;
  }> {
    const plan = await this.planPublishProposal(proposalId);
    if (plan.planHash !== expectedPlanHash) throw new Error("QUEST_PUBLISH_PLAN_CHANGED");
    const proposal = await this.persistenceEngine.getProposal(proposalId);
    if (!proposal || proposal.receiptHash !== plan.proposalReceiptHash) throw new Error("QUEST_PROPOSAL_STALE_OR_MISSING");
    const previous = this.templateRegistry.getTemplate(plan.template.templateId, plan.template.version);
    const previousHash = previous ? computeCanonicalHash("aurion.quest.template.v1", previous) : null;
    const receipt = createQuestPublishReceipt({
      actorUserId,
      proposalId,
      planHash: plan.planHash,
      previousHash,
      resultHash: plan.templateHash,
    });
    await this.persistenceEngine.publishProposal({ proposal, template: plan.template, receipt, payload: plan });
    this.templateRegistry.registerTemplate(plan.template);
    return { receipt, templateSetHash: this.templateRegistry.getTemplateSetHash(), template: plan.template };
  }

  public async availableQuests() {
    await this.ensureHydrated();
    const { eligibleTemplates } = CandidateResolver.resolveCandidates(this.templateRegistry.getActiveTemplates(), this.worldFactEngine.getFacts());
    return eligibleTemplates.map(template => ({
      templateId: template.templateId,
      version: template.version,
      title: template.title,
      description: template.description,
      roles: template.roles.map(role => role.roleName),
      nodeCount: template.nodes.length,
    }));
  }

  public async offerQuest(params: { playerUserId: number; templateId: string }) {
    await this.ensureHydrated();
    const event = this.worldFactEngine.getEvents().at(-1);
    if (!event) throw new Error("QUEST_CANONICAL_TRIGGER_EVENT_REQUIRED");
    const { instance, plan } = this.runtimeEngine.compileAndOfferQuest({
      worldId: "echoes-of-aurion-global",
      playerUserId: params.playerUserId,
      triggerEventId: event.id,
      requestedTemplateId: params.templateId,
    });
    await this.persistenceEngine.savePlan(plan);
    await this.persistenceEngine.saveInstance(instance);
    return { instance, planHash: plan.planHash, graphHash: plan.graphHash };
  }

  public async playerQuestDetails(userId: number, instanceId: string) {
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    return { instance, plan };
  }

  private async ownedInstance(userId: number, instanceId: string) {
    const instance = await this.persistenceEngine.getInstance(instanceId);
    if (!instance || instance.playerUserId !== userId) throw new Error("QUEST_INSTANCE_OWNERSHIP_REQUIRED");
    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error("QUEST_PLAN_NOT_FOUND");
    return { instance, plan };
  }

  public async acceptQuest(userId: number, instanceId: string) {
    const { instance } = await this.ownedInstance(userId, instanceId);
    const result = this.runtimeEngine.acceptQuest(instance);
    await this.persistenceEngine.saveReceipt(result.receipt);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    return result;
  }

  public async progressQuest(userId: number, instanceId: string, objectiveKey: string, amount: number) {
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const result = this.runtimeEngine.progressObjective(instance, plan, objectiveKey, amount);
    await this.persistenceEngine.saveReceipt(result.receipt);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    return result;
  }

  public async chooseQuestBranch(userId: number, instanceId: string, edgeId: string) {
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const result = this.runtimeEngine.chooseBranch(instance, plan, edgeId);
    await this.persistenceEngine.saveReceipt(result.receipt);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    return result;
  }

  public async completeQuest(userId: number, instanceId: string) {
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const current = plan.nodes.find(node => node.id === instance.currentNodeId);
    if (!current || current.type !== "end") throw new Error("QUEST_END_NODE_REQUIRED");
    const result = this.runtimeEngine.completeQuest(instance, plan);
    await this.persistenceEngine.saveReceipt(result.receipt);
    await this.persistenceEngine.saveInstance(result.updatedInstance);
    return result;
  }
}
