import {
  QuestAdminProposalSchema,
  QuestTemplateVersionSchema,
  type QuestAdminProposal,
  type QuestInstance,
  type QuestPlan,
  type QuestReplayReceipt,
  type QuestTemplateVersion,
  type WorldFact,
} from "../../shared/aurionQuestContract";
import { computeCanonicalHash, computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import { type AuthoringReceipt } from "../../shared/aurionAuthoringContract";
import { QuestPublishPlanSchema, type QuestPublishPlan } from "./questPublishContract";
import { OperationalClock, hostOperationalClock, operationalDate } from "../../shared/operationalClock";
import { WorldFactEngine } from "./worldFacts";
import { QuestTemplateRegistry } from "./templateRegistry";
import { QuestRuntimeEngine } from "./runtime";
import { QuestPersistenceEngine } from "./persistence";
import { QuestReplayEngine } from "./replay";
import { QuestValidator } from "./validator";
import { CandidateResolver } from "./candidateResolver";
import { authoringHash, createQuestPublishReceipt } from "../aurionAuthoringPersistence";
import { materializeQuestDomainCommand } from "./materialization";
import type { QuestCompleteSource } from "../../shared/aurionQuestDomainCommandContract";
import { readQuestCausalAnchorByReceiptId, resolveQuestCausalAnchor } from "./causalAnchor";
import { buildQuestCausalClosure } from "./causalClosure";
import { LEGACY_CANONICAL_QUEST_TEMPLATES } from "./legacyQuestTemplate";
import { getLegacyQuestBridge } from "../legacyQuestBridge";
import { assertQuestNpcAuthority } from "../questNpcAuthority";
import { readEncounterCompletionEvidence } from "../encounterCompletionEvidence";
import { getDb } from "../db";
import { gameplayQuestProgress } from "../../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";

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
    for (const template of LEGACY_CANONICAL_QUEST_TEMPLATES) this.templateRegistry.registerTemplate(template);
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
    const receipts = await this.persistenceEngine.getReceiptsForInstance(instanceId);
    return this.replayEngine.replayInstance(
      instance,
      plan,
      this.worldFactEngine.getFacts(),
      instance.planHash,
      instance.worldStateRevision,
      { receipts },
    );
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
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const idempotencyKey = `accept:${instance.id}`;
    const prior = await this.persistenceEngine.getReceiptByIdempotencyKey(idempotencyKey);
    if (prior) {
      if (prior.instanceId !== instance.id || prior.idempotencyKey !== idempotencyKey) throw new Error("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");
      if (computeQuestStateHash(instance) !== prior.resultStateHash) throw new Error("QUEST_RECEIPT_READBACK_MISMATCH");
      return { updatedInstance: instance, receipt: prior };
    }
    const result = this.runtimeEngine.executeDomainCommand(
      materializeQuestDomainCommand(instance, plan, {
        kind: "accept",
        instanceId: instance.id,
        planHash: instance.planHash,
        graphHash: instance.graphHash,
        expectedStateHash: computeQuestStateHash(instance),
        idempotencyKey,
        eventSequence: 1,
      }),
      instance,
      plan,
    );
    return (await this.persistenceEngine.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: computeQuestStateHash(instance),
      idempotencyKey,
      receipt: result.receipt,
      updatedInstance: result.updatedInstance,
    })).replayed
      ? { updatedInstance: await this.persistenceEngine.getInstance(instance.id) ?? result.updatedInstance, receipt: result.receipt }
      : result;
  }

  public async applyConfirmedObjectiveEvent(userId: number, event: {
    source: "world_chunk_delta" | "group_instance" | "encounter";
    event: "resource_depleted" | "structure_placed" | "structure_removed" | "road_built" | "cleared" | "completed";
    sourceEventId: string;
    sourceEventSequence: number;
    targetId?: string;
    payload?: Record<string, string | number | boolean>;
  }) {
    if (!event.sourceEventId || !Number.isSafeInteger(event.sourceEventSequence) || event.sourceEventSequence < 0) {
      throw new Error("QUEST_SOURCE_EVENT_IDENTITY_REQUIRED");
    }
    const instances = await this.persistenceEngine.listInstances({ playerUserId: userId });
    const updates: Array<{ instanceId: string; receiptId: string; completedNode: boolean; replayed: boolean }> = [];
    for (const listedInstance of instances) {
      const sourceIdempotencyKey = computeCanonicalHash("aurion.quest.event.v1", {
        source: event.source,
        sourceEventId: event.sourceEventId,
        sourceEventSequence: event.sourceEventSequence,
        event: event.event,
        targetId: event.targetId ?? null,
        payload: event.payload ?? {},
        instanceId: listedInstance.id,
      });
      const prior = await this.persistenceEngine.getReceiptByIdempotencyKey(sourceIdempotencyKey);
      if (prior) {
        updates.push({
          instanceId: prior.instanceId,
          receiptId: prior.id,
          completedNode: false,
          replayed: true,
        });
        continue;
      }

      const instance = await this.persistenceEngine.getInstance(listedInstance.id);
      if (!instance || instance.state !== "active") continue;
      const plan = await this.persistenceEngine.getPlan(instance.planHash);
      if (!plan) continue;
      const node = plan.nodes.find(candidate => candidate.id === instance.currentNodeId);
      const objective = node?.objective;
      const binding = objective?.eventBinding;
      if (!objective || !binding || binding.source !== event.source || binding.event !== event.event) continue;
      if (binding.matchField && binding.matchValue) {
        const actual = binding.matchField === "targetId"
          ? event.targetId
          : event.payload?.[binding.matchField];
        if (String(actual ?? "") !== binding.matchValue) continue;
      }

      const expectedStateHash = computeQuestStateHash(instance);
      const priorReceipts = await this.persistenceEngine.getReceiptsForInstance(instance.id);
      const eventSequence = (priorReceipts.at(-1)?.eventSequence ?? 0) + 1;
      const idempotencyKey = computeCanonicalHash("aurion.quest.event.v1", {
        source: event.source,
        sourceEventId: event.sourceEventId,
        sourceEventSequence: event.sourceEventSequence,
        event: event.event,
        targetId: event.targetId ?? null,
        payload: event.payload ?? {},
        instanceId: instance.id,
      });
      const result = this.runtimeEngine.executeDomainCommand(
        materializeQuestDomainCommand(instance, plan, {
          kind: "progress",
          instanceId: instance.id,
          planHash: instance.planHash,
          graphHash: instance.graphHash,
          expectedStateHash,
          idempotencyKey,
          eventSequence,
          objectiveKey: objective.key,
          amount: 1,
        }),
        instance,
        plan,
      );
      if (result.kind !== "progress") {
        throw new Error("QUEST_DOMAIN_COMMAND_KIND_MISMATCH");
      }
      const committed = await this.persistenceEngine.commitObjectiveTransition({
        instanceId: instance.id,
        expectedStateHash,
        idempotencyKey,
        receipt: result.receipt,
        updatedInstance: result.updatedInstance,
      });
      updates.push({
        instanceId: instance.id,
        receiptId: committed.receipt.id,
        completedNode: result.completedNode,
        replayed: committed.replayed,
      });
    }
    return Object.freeze(updates);
  }

  public async acceptLegacyQuest(userId: number, questKey: import("../gameplayProtocol").QuestKey, clientGiver?: string) {
    const authority = await assertQuestNpcAuthority({ userId, questKey, kind: "accept", ...(clientGiver ? { clientGiver } : {}) });
    const templateId = `tpl_legacy_${questKey}`;
    await this.hydrateDialogueTrigger(authority.dialogueCommandReceiptId, userId, questKey);
    const existing = (await this.persistenceEngine.listInstances({ playerUserId: userId }))
      .find(instance => instance.templateId === templateId && ["offered", "active"].includes(instance.state));
    let offeredInstance: QuestInstance;
    let offeredPlan: QuestPlan;
    if (existing) {
      const existingPlan = await this.persistenceEngine.getPlan(existing.planHash);
      if (!existingPlan) throw new Error("QUEST_LEGACY_PLAN_NOT_FOUND");
      offeredInstance = existing;
      offeredPlan = existingPlan;
    } else {
      const offered = await this.offerQuest({ playerUserId: userId, templateId });
      const plan = await this.persistenceEngine.getPlan(offered.planHash);
      if (!plan) throw new Error("QUEST_LEGACY_PLAN_NOT_FOUND");
      offeredInstance = offered.instance;
      offeredPlan = plan;
    }
    if (offeredInstance.state === "offered") await this.acceptQuest(userId, offeredInstance.id);
    const { getGameplayProgress } = await import("../db");
    return getGameplayProgress(userId);
  }

  public async completeLegacyQuest(userId: number, questKey: import("../gameplayProtocol").QuestKey, clientGiver?: string) {
    await assertQuestNpcAuthority({ userId, questKey, kind: "complete", ...(clientGiver ? { clientGiver } : {}) });
    const templateId = `tpl_legacy_${questKey}`;
    const instance = (await this.persistenceEngine.listInstances({ playerUserId: userId }))
      .find(candidate => candidate.templateId === templateId && ["active", "completed"].includes(candidate.state));
    if (!instance) throw new Error("QUEST_CANONICAL_INSTANCE_REQUIRED");

    // A completed canonical instance may only be projecting the compatibility
    // read model after a lost response; never re-run the causal closure.
    if (instance.state === "completed") {
      const { completeGameplayQuest } = await import("../db");
      return completeGameplayQuest({ userId, questKey, giver: getLegacyQuestBridge(questKey).giver });
    }

    const plan = await this.persistenceEngine.getPlan(instance.planHash);
    if (!plan) throw new Error("QUEST_PLAN_NOT_FOUND");

    const db = await getDb();
    if (!db) throw new Error("Game database is not available");
    const progressRow = (await db.select().from(gameplayQuestProgress).where(and(
      eq(gameplayQuestProgress.userId, userId),
      eq(gameplayQuestProgress.questKey, questKey),
    )).orderBy(desc(gameplayQuestProgress.id)).limit(1))[0];
    if (!progressRow?.completionSessionId) throw new Error("QUEST_COMPLETION_EVIDENCE_REQUIRED");
    const evidence = await readEncounterCompletionEvidence(userId, progressRow.completionSessionId);

    const progressUpdates = await this.applyConfirmedObjectiveEvent(userId, {
      source: "encounter",
      event: "completed",
      sourceEventId: evidence.eventId,
      sourceEventSequence: evidence.completionSequence,
      targetId: evidence.encounterKey,
      payload: { encounterKey: evidence.encounterKey, evidenceHash: evidence.evidenceHash },
    });
    const updated = await this.persistenceEngine.getInstance(instance.id);
    if (!updated) throw new Error("QUEST_INSTANCE_NOT_FOUND");
    const updatedPlan = await this.persistenceEngine.getPlan(updated.planHash);
    if (!updatedPlan) throw new Error("QUEST_PLAN_NOT_FOUND");
    const objectiveUpdate = progressUpdates.find(item => item.instanceId === updated.id);
    if (!objectiveUpdate?.completedNode) throw new Error("QUEST_ENCOUNTER_OBJECTIVE_NOT_COMPLETED");

    const zone = (await import("../zoneRuntime")).globalZoneRegistry.get("observatory_threshold");
    const connectionId = zone.connectionIdForUser(userId);
    if (!connectionId) throw new Error("QUEST_ZONE_CONNECTION_REQUIRED");
    const source = {
      triggerEventId: updated.triggerEventId!,
      triggerEventDigest: updated.triggerEventDigest!,
      sourceEvidenceId: evidence.eventId,
      sourceEvidenceDigest: evidence.evidenceHash,
      sourceLogicalRevision: updated.worldStateRevision!,
      compilerVersion: updated.compilerVersion!,
      sourceRevision: updated.sourceRevision!,
      templateSetHash: updated.templateSetHash!,
      candidateSetHash: updated.candidateSetHash!,
      seedDigest: updated.seedDigest!,
      roleBindingHash: updated.roleBindingHash!,
    };
    const nextSequence = (await this.persistenceEngine.getReceiptsForInstance(updated.id))
      .reduce((max, receipt) => Math.max(max, receipt.eventSequence), 0) + 1;
    const completionCommand = materializeQuestDomainCommand(updated, updatedPlan, {
      kind: "complete",
      instanceId: updated.id,
      planHash: updated.planHash,
      graphHash: updated.graphHash,
      expectedStateHash: computeQuestStateHash(updated),
      idempotencyKey: `complete:${updated.id}`,
      eventSequence: nextSequence,
      ...source,
    });
    if (completionCommand.kind !== "complete") throw new Error("QUEST_LEGACY_COMPLETION_COMMAND_KIND_MISMATCH");
    zone.enqueueIntent({
      type: "quest_hand_in",
      connectionId,
      entityId: `player:${userId}`,
      clientSeq: zone.nextClientSequenceForUser(userId),
      arrivalSeq: zone.nextArrivalSequence(),
      questId: updated.templateId,
      instanceId: completionCommand.instanceId,
      commandId: completionCommand.commandId,
      planHash: completionCommand.planHash,
      graphHash: completionCommand.graphHash,
      expectedStateHash: completionCommand.expectedStateHash,
      triggerEventId: completionCommand.triggerEventId,
      triggerEventDigest: completionCommand.triggerEventDigest,
      sourceEvidenceId: completionCommand.sourceEvidenceId,
      sourceEvidenceDigest: completionCommand.sourceEvidenceDigest,
      sourceLogicalRevision: completionCommand.sourceLogicalRevision,
      compilerVersion: completionCommand.compilerVersion,
      sourceRevision: completionCommand.sourceRevision,
      templateSetHash: completionCommand.templateSetHash,
      candidateSetHash: completionCommand.candidateSetHash,
      seedDigest: completionCommand.seedDigest,
      roleBindingHash: completionCommand.roleBindingHash,
    });
    await zone.tick();
    await (await import("../causality/tickRecorder")).globalTickRecorder.flushPersistence();

    const committed = await this.completeQuest(userId, updated.id, source);
    // Compatibility projection only: the old gameplay read model is finalized
    // after canonical receipt/closure. The route itself no longer calls the legacy authority.
    const { completeGameplayQuest } = await import("../db");
    const result = await completeGameplayQuest({ userId, questKey, giver: getLegacyQuestBridge(questKey).giver });
    return { ...result, canonical: committed };
  }

  private async hydrateDialogueTrigger(dialogueCommandReceiptId: string, userId: number, questKey: import("../gameplayProtocol").QuestKey) {
    const db = await getDb();
    if (!db) throw new Error("Game database is not available");
    const { aurionDialogueCommandReceipts } = await import("../../drizzle/schema");
    const row = (await db.select().from(aurionDialogueCommandReceipts).where(and(
      eq(aurionDialogueCommandReceipts.id, dialogueCommandReceiptId),
      eq(aurionDialogueCommandReceipts.userId, userId),
      eq(aurionDialogueCommandReceipts.questKey, questKey),
    )).limit(1))[0];
    if (!row) throw new Error("QUEST_DIALOGUE_TRIGGER_UNPROVABLE");
    const payload = JSON.parse(row.outcomeJson) as Record<string, unknown>;
    this.worldFactEngine.recordEvent({
      id: `evt_legacy_dialogue_${row.id}`,
      type: "QUEST_DIALOGUE_COMMAND",
      source: "aurion.dialogue.command.receipt",
      data: Object.freeze({
        dialogueCommandReceiptId: row.id,
        dialogueReceiptId: row.dialogueReceiptId,
        userId: row.userId,
        npcId: row.npcId,
        actionKind: row.actionKind,
        questKey: row.questKey,
        outcome: payload,
      }),
    });
  }

  public async chooseQuestBranch(userId: number, instanceId: string, edgeId: string) {
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const idempotencyKey = `choice:${instance.id}:${edgeId}`;
    const prior = await this.persistenceEngine.getReceiptByIdempotencyKey(idempotencyKey);
    if (prior) {
      if (prior.instanceId !== instance.id || prior.idempotencyKey !== idempotencyKey) throw new Error("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");
      if (computeQuestStateHash(instance) !== prior.resultStateHash) throw new Error("QUEST_RECEIPT_READBACK_MISMATCH");
      return { updatedInstance: instance, receipt: prior };
    }
    const nextSequence = (await this.persistenceEngine.getReceiptsForInstance(instance.id)).reduce(
      (max, receipt) => Math.max(max, receipt.eventSequence),
      0,
    ) + 1;
    const result = this.runtimeEngine.executeDomainCommand(
      materializeQuestDomainCommand(instance, plan, {
        kind: "choice",
        instanceId: instance.id,
        planHash: instance.planHash,
        graphHash: instance.graphHash,
        expectedStateHash: computeQuestStateHash(instance),
        idempotencyKey,
        eventSequence: nextSequence,
        edgeId,
      }),
      instance,
      plan,
    );
    const committed = await this.persistenceEngine.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: computeQuestStateHash(instance),
      idempotencyKey,
      receipt: result.receipt,
      updatedInstance: result.updatedInstance,
    });
    return { updatedInstance: committed.updatedInstance, receipt: committed.receipt };
  }

  public async completeQuest(userId: number, instanceId: string, source?: QuestCompleteSource) {
    if (!source) throw new Error("QUEST_CAUSAL_SOURCE_REQUIRED");
    const { instance, plan } = await this.ownedInstance(userId, instanceId);
    const current = plan.nodes.find(node => node.id === instance.currentNodeId);
    if (!current || current.type !== "end") throw new Error("QUEST_END_NODE_REQUIRED");
    const idempotencyKey = `complete:${instance.id}`;
    const prior = await this.persistenceEngine.getReceiptByIdempotencyKey(idempotencyKey);
    if (prior) {
      if (prior.instanceId !== instance.id || prior.idempotencyKey !== idempotencyKey) throw new Error("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");
      if (computeQuestStateHash(instance) !== prior.resultStateHash) throw new Error("QUEST_RECEIPT_READBACK_MISMATCH");
      const anchor = await readQuestCausalAnchorByReceiptId(prior.id);
      if (
        anchor.planHash !== prior.planHash ||
        anchor.graphHash !== prior.graphHash ||
        anchor.resultStateHash !== prior.resultStateHash
      ) throw new Error("QUEST_CAUSAL_ANCHOR_REPLAY_BINDING_MISMATCH");
      return {
        updatedInstance: instance,
        receipt: prior,
        replayed: true as const,
      };
    }
    const nextSequence = (await this.persistenceEngine.getReceiptsForInstance(instance.id)).reduce(
      (max, receipt) => Math.max(max, receipt.eventSequence),
      0,
    ) + 1;
    const completionCommand = materializeQuestDomainCommand(instance, plan, {
      kind: "complete",
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash: computeQuestStateHash(instance),
      idempotencyKey,
      eventSequence: nextSequence,
      ...source,
    });
    const result = this.runtimeEngine.executeDomainCommand(
      completionCommand,
      instance,
      plan,
    );
    const resolvedAnchor = await resolveQuestCausalAnchor({
      instance,
      plan,
      command: completionCommand,
      receipt: result.receipt,
    });
    const closure = buildQuestCausalClosure({
      instance,
      plan,
      command: completionCommand,
      receipt: result.receipt,
      anchor: resolvedAnchor.anchor,
    });
    const committed = await this.persistenceEngine.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: computeQuestStateHash(instance),
      idempotencyKey,
      receipt: result.receipt,
      updatedInstance: result.updatedInstance,
      causalClosure: closure,
    });
    return {
      updatedInstance: committed.updatedInstance,
      receipt: committed.receipt,
      replayed: committed.replayed,
    };
  }
}
