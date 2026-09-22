import { and, desc, eq } from "drizzle-orm";
import {
  QuestAdminProposalSchema,
  QuestInstanceSchema,
  QuestPlanSchema,
  QuestReceiptSchema,
  QuestTemplateVersionSchema,
  type QuestAdminProposal,
  type QuestInstance,
  type QuestPlan,
  type QuestReceipt,
  type QuestTemplateVersion,
} from "../../shared/aurionQuestContract";
import { computeCanonicalHash, computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import { persistAuthoringReceipt } from "../aurionAuthoringPersistence";
import type { AuthoringReceipt } from "../../shared/aurionAuthoringContract";
import { getDb } from "../db";
import {
  aurionQuestAdminProposals,
  aurionQuestInstances,
  aurionQuestPlans,
  aurionQuestReceipts,
  aurionQuestTemplateVersions,
} from "../../drizzle/schema";

export class QuestPersistenceEngine {
  private instances = new Map<string, QuestInstance>();
  private plans = new Map<string, QuestPlan>();
  private receipts = new Map<string, QuestReceipt>();
  private templates = new Map<string, QuestTemplateVersion>();
  private proposals = new Map<string, QuestAdminProposal>();
  private instanceLocks = new Map<string, Promise<void>>();

  private templateKey(templateId: string, version: number) { return `${templateId}:v${version}`; }

  public seedEphemeral(plan: QuestPlan, instance: QuestInstance): void {
    const parsedPlan = QuestPlanSchema.parse(plan);
    const parsedInstance = QuestInstanceSchema.parse(instance);
    this.plans.set(parsedPlan.planHash, parsedPlan);
    this.instances.set(parsedInstance.id, parsedInstance);
  }

  public async saveTemplateVersion(raw: QuestTemplateVersion): Promise<void> {
    const template = QuestTemplateVersionSchema.parse(raw);
    const templateHash = computeCanonicalHash("aurion.quest.template.v1", template);
    this.templates.set(this.templateKey(template.templateId, template.version), template);
    const db = await getDb();
    if (!db) return;
    const existing = (await db.select().from(aurionQuestTemplateVersions)
      .where(and(eq(aurionQuestTemplateVersions.templateId, template.templateId), eq(aurionQuestTemplateVersions.version, template.version))))[0];
    if (existing && existing.templateHash !== templateHash) throw new Error("QUEST_TEMPLATE_VERSION_CONFLICT");
    if (!existing) {
      await db.insert(aurionQuestTemplateVersions).values({
        templateId: template.templateId,
        version: template.version,
        title: template.title,
        description: template.description,
        templateJson: JSON.stringify(template),
        templateHash,
        active: template.active,
        quarantined: template.quarantined,
      });
    } else {
      await db.update(aurionQuestTemplateVersions).set({ active: template.active, quarantined: template.quarantined })
        .where(and(eq(aurionQuestTemplateVersions.templateId, template.templateId), eq(aurionQuestTemplateVersions.version, template.version)));
    }
  }

  public async listTemplateVersions(): Promise<QuestTemplateVersion[]> {
    const db = await getDb();
    if (!db) return [...this.templates.values()].sort((a,b)=>this.templateKey(a.templateId,a.version).localeCompare(this.templateKey(b.templateId,b.version)));
    const rows = await db.select().from(aurionQuestTemplateVersions)
      .orderBy(aurionQuestTemplateVersions.templateId, desc(aurionQuestTemplateVersions.version));
    const parsed = rows.map(row => {
      const template = QuestTemplateVersionSchema.parse(JSON.parse(row.templateJson));
      const hash = computeCanonicalHash("aurion.quest.template.v1", template);
      if (template.templateId !== row.templateId || template.version !== row.version || hash !== row.templateHash) throw new Error("QUEST_TEMPLATE_STORED_IDENTITY_CORRUPT");
      return template;
    });
    for (const template of parsed) this.templates.set(this.templateKey(template.templateId, template.version), template);
    return parsed;
  }

  public async saveProposal(raw: QuestAdminProposal): Promise<void> {
    const proposal = QuestAdminProposalSchema.parse(raw);
    this.proposals.set(proposal.id, proposal);
    const db = await getDb();
    if (!db) return;
    const existing = (await db.select().from(aurionQuestAdminProposals).where(eq(aurionQuestAdminProposals.id, proposal.id)))[0];
    if (existing && existing.receiptHash !== proposal.receiptHash) throw new Error("QUEST_PROPOSAL_IDENTITY_CONFLICT");
    if (!existing) {
      await db.insert(aurionQuestAdminProposals).values({
        id: proposal.id,
        proposalType: proposal.proposalType,
        authorUserId: proposal.authorUserId,
        templateId: proposal.templateId,
        templateVersion: proposal.templateVersion,
        expectedTemplateSetHash: proposal.expectedTemplateSetHash,
        proposedDataJson: proposal.proposedDataJson,
        status: proposal.status,
        receiptHash: proposal.receiptHash,
      });
    }
  }

  public async getProposal(id: string): Promise<QuestAdminProposal | undefined> {
    const db = await getDb();
    if (!db) return this.proposals.get(id);
    const row = (await db.select().from(aurionQuestAdminProposals).where(eq(aurionQuestAdminProposals.id, id)))[0];
    if (!row) return undefined;
    const proposal = QuestAdminProposalSchema.parse({
      id: row.id,
      proposalType: row.proposalType,
      authorUserId: row.authorUserId,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      expectedTemplateSetHash: row.expectedTemplateSetHash,
      proposedDataJson: row.proposedDataJson,
      status: row.status,
      receiptHash: row.receiptHash,
      createdAt: row.createdAt.toISOString(),
    });
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  public async setProposalStatus(id: string, status: "draft" | "active" | "rejected"): Promise<void> {
    const proposal = await this.getProposal(id);
    if (!proposal) throw new Error("QUEST_PROPOSAL_NOT_FOUND");
    const next = QuestAdminProposalSchema.parse({ ...proposal, status });
    this.proposals.set(id, next);
    const db = await getDb();
    if (db) await db.update(aurionQuestAdminProposals).set({ status }).where(eq(aurionQuestAdminProposals.id, id));
  }

  public async publishProposal(input: {
    proposal: QuestAdminProposal;
    template: QuestTemplateVersion;
    receipt: AuthoringReceipt;
    payload: unknown;
  }): Promise<void> {
    const proposal = QuestAdminProposalSchema.parse(input.proposal);
    const template = QuestTemplateVersionSchema.parse(input.template);
    const templateHash = computeCanonicalHash("aurion.quest.template.v1", template);
    const db = await getDb();
    if (!db) {
      this.templates.set(this.templateKey(template.templateId, template.version), template);
      this.proposals.set(proposal.id, QuestAdminProposalSchema.parse({ ...proposal, status: "active" }));
      return;
    }
    await db.transaction(async tx => {
      const existing = (await tx.select().from(aurionQuestTemplateVersions)
        .where(and(eq(aurionQuestTemplateVersions.templateId, template.templateId), eq(aurionQuestTemplateVersions.version, template.version))).for("update"))[0];
      if (existing && existing.templateHash !== templateHash) throw new Error("QUEST_TEMPLATE_VERSION_CONFLICT");
      if (!existing) {
        await tx.insert(aurionQuestTemplateVersions).values({
          templateId: template.templateId,
          version: template.version,
          title: template.title,
          description: template.description,
          templateJson: JSON.stringify(template),
          templateHash,
          active: true,
          quarantined: false,
        });
      } else {
        await tx.update(aurionQuestTemplateVersions).set({ active: true, quarantined: false })
          .where(and(eq(aurionQuestTemplateVersions.templateId, template.templateId), eq(aurionQuestTemplateVersions.version, template.version)));
      }
      const proposalRow = (await tx.select().from(aurionQuestAdminProposals).where(eq(aurionQuestAdminProposals.id, proposal.id)).for("update"))[0];
      if (!proposalRow || proposalRow.receiptHash !== proposal.receiptHash || proposalRow.status !== "draft") throw new Error("QUEST_PROPOSAL_STALE_OR_MISSING");
      await tx.update(aurionQuestAdminProposals).set({ status: "active" }).where(eq(aurionQuestAdminProposals.id, proposal.id));
      await persistAuthoringReceipt(tx, input.receipt, input.payload);
    });
    this.templates.set(this.templateKey(template.templateId, template.version), template);
    this.proposals.set(proposal.id, QuestAdminProposalSchema.parse({ ...proposal, status: "active" }));
  }

  public async savePlan(raw: QuestPlan): Promise<void> {
    const plan = QuestPlanSchema.parse(raw);
    this.plans.set(plan.planHash, plan);
    const db = await getDb();
    if (!db) return;
    const existing = (await db.select().from(aurionQuestPlans).where(eq(aurionQuestPlans.planHash, plan.planHash)))[0];
    if (!existing) {
      await db.insert(aurionQuestPlans).values({
        planHash: plan.planHash,
        templateId: plan.templateId,
        templateVersion: plan.templateVersion,
        templateSetHash: plan.templateSetHash,
        candidateSetHash: plan.candidateSetHash,
        seedDigest: plan.seedDigest,
        roleBindingHash: plan.roleBindingHash,
        graphHash: plan.graphHash,
        planJson: JSON.stringify(plan),
      });
    } else if (existing.graphHash !== plan.graphHash) throw new Error("QUEST_PLAN_HASH_CONFLICT");
  }

  public async getPlan(planHash: string): Promise<QuestPlan | undefined> {
    const db = await getDb();
    if (!db) return this.plans.get(planHash);
    const row = (await db.select().from(aurionQuestPlans).where(eq(aurionQuestPlans.planHash, planHash)))[0];
    if (!row) return undefined;
    const plan = QuestPlanSchema.parse(JSON.parse(row.planJson));
    if (plan.planHash !== row.planHash || plan.graphHash !== row.graphHash) throw new Error("QUEST_PLAN_STORED_IDENTITY_CORRUPT");
    this.plans.set(plan.planHash, plan);
    return plan;
  }

  public async saveInstance(raw: QuestInstance): Promise<void> {
    const instance = QuestInstanceSchema.parse(raw);
    this.instances.set(instance.id, instance);
    const db = await getDb();
    if (!db) return;
    const row = {
      id: instance.id,
      worldId: instance.worldId,
      playerUserId: instance.playerUserId,
      giverNpcId: instance.giverNpcId,
      templateId: instance.templateId,
      templateVersion: instance.templateVersion,
      seedDigest: instance.seedDigest,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      currentNodeId: instance.currentNodeId,
      state: instance.state,
      instanceJson: JSON.stringify(instance),
    };
    await db.insert(aurionQuestInstances).values(row).onDuplicateKeyUpdate({ set: row });
  }

  public async getInstance(instanceId: string): Promise<QuestInstance | undefined> {
    const db = await getDb();
    if (!db) return this.instances.get(instanceId);
    const row = (await db.select().from(aurionQuestInstances).where(eq(aurionQuestInstances.id, instanceId)))[0];
    if (!row) return undefined;
    const instance = QuestInstanceSchema.parse(JSON.parse(row.instanceJson));
    if (instance.id !== row.id || instance.planHash !== row.planHash || instance.graphHash !== row.graphHash) throw new Error("QUEST_INSTANCE_STORED_IDENTITY_CORRUPT");
    this.instances.set(instance.id, instance);
    return instance;
  }

  public async listInstances(filter?: { playerUserId?: number; state?: string }): Promise<QuestInstance[]> {
    const db = await getDb();
    if (!db) {
      let list = Array.from(this.instances.values());
      if (filter?.playerUserId !== undefined) list = list.filter(i => i.playerUserId === filter.playerUserId);
      if (filter?.state !== undefined) list = list.filter(i => i.state === filter.state);
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    let rows = await db.select().from(aurionQuestInstances).orderBy(desc(aurionQuestInstances.createdAt));
    if (filter?.playerUserId !== undefined) rows = rows.filter(row => row.playerUserId === filter.playerUserId);
    if (filter?.state !== undefined) rows = rows.filter(row => row.state === filter.state);
    return rows.map(row => QuestInstanceSchema.parse(JSON.parse(row.instanceJson)));
  }

  private async withInstanceLock<T>(instanceId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.instanceLocks.get(instanceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.instanceLocks.set(instanceId, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.instanceLocks.get(instanceId) === current) this.instanceLocks.delete(instanceId);
    }
  }

  public verifyReceiptIntegrity(receipt: QuestReceipt): boolean {
    const expected = computeCanonicalHash("aurion.quest.event.v1", {
      previousStateHash: receipt.previousStateHash,
      resultStateHash: receipt.resultStateHash,
    });
    return receipt.receiptHash === expected;
  }

  public async commitObjectiveTransition(input: {
    instanceId: string;
    expectedStateHash: string;
    idempotencyKey: string;
    receipt: QuestReceipt;
    updatedInstance: QuestInstance;
  }): Promise<{ updatedInstance: QuestInstance; receipt: QuestReceipt; replayed: boolean }> {
    if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new Error("QUEST_IDEMPOTENCY_KEY_INVALID");
    if (input.receipt.idempotencyKey !== input.idempotencyKey || input.receipt.instanceId !== input.instanceId) {
      throw new Error("QUEST_RECEIPT_IDENTITY_MISMATCH");
    }
    if (!this.verifyReceiptIntegrity(input.receipt)) throw new Error(`QUEST_RECEIPT_TAMPER_DETECTED:${input.receipt.id}`);
    return this.withInstanceLock(input.instanceId, async () => {
      const db = await getDb();
      if (!db) {
        const replay = [...this.receipts.values()].find(receipt =>
          receipt.instanceId === input.instanceId && receipt.idempotencyKey === input.idempotencyKey
        );
        if (replay) {
          if (
            replay.receiptHash !== input.receipt.receiptHash ||
            replay.resultStateHash !== input.receipt.resultStateHash ||
            replay.planHash !== input.receipt.planHash ||
            replay.graphHash !== input.receipt.graphHash
          ) {
            throw new Error("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");
          }
          const current = this.instances.get(input.instanceId);
          if (!current) throw new Error(`QUEST_INSTANCE_NOT_FOUND:${input.instanceId}`);
          return { updatedInstance: current, receipt: replay, replayed: true };
        }
        const current = this.instances.get(input.instanceId);
        if (!current) throw new Error(`QUEST_INSTANCE_NOT_FOUND:${input.instanceId}`);
        const currentHash = computeQuestStateHash(current);
        if (
          currentHash !== input.expectedStateHash ||
          input.receipt.previousStateHash !== currentHash ||
          input.updatedInstance.id !== current.id ||
          input.updatedInstance.worldId !== current.worldId ||
          input.updatedInstance.playerUserId !== current.playerUserId ||
          input.updatedInstance.planHash !== current.planHash ||
          input.updatedInstance.graphHash !== current.graphHash
        ) {
          throw new Error("QUEST_RUNTIME_STALE_STATE");
        }
        if (computeQuestStateHash(input.updatedInstance) !== input.receipt.resultStateHash) {
          throw new Error("QUEST_RESULT_STATE_HASH_MISMATCH");
        }
        const lastSequence = [...this.receipts.values()]
          .filter(receipt => receipt.instanceId === input.instanceId)
          .reduce((max, receipt) => Math.max(max, receipt.eventSequence), 0);
        if (input.receipt.eventSequence !== lastSequence + 1) throw new Error("QUEST_RUNTIME_SEQUENCE_CONFLICT");
        this.instances.set(input.instanceId, input.updatedInstance);
        this.receipts.set(input.receipt.id, input.receipt);
        return { updatedInstance: input.updatedInstance, receipt: input.receipt, replayed: false };
      }

      return db.transaction(async tx => {
        const instanceRow = (await tx.select().from(aurionQuestInstances)
          .where(eq(aurionQuestInstances.id, input.instanceId)).for("update").limit(1))[0];
        if (!instanceRow) throw new Error(`QUEST_INSTANCE_NOT_FOUND:${input.instanceId}`);

        const replayRow = (await tx.select().from(aurionQuestReceipts)
          .where(eq(aurionQuestReceipts.idempotencyKey, input.idempotencyKey)).limit(1))[0];
        if (replayRow) {
          if (
            replayRow.instanceId !== input.instanceId ||
            replayRow.receiptHash !== input.receipt.receiptHash ||
            replayRow.resultStateHash !== input.receipt.resultStateHash ||
            replayRow.planHash !== input.receipt.planHash ||
            replayRow.graphHash !== input.receipt.graphHash
          ) {
            throw new Error("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");
          }
          const instance = QuestInstanceSchema.parse(JSON.parse(instanceRow.instanceJson));
          const receipt = QuestReceiptSchema.parse({
            id: replayRow.id,
            instanceId: replayRow.instanceId,
            eventSequence: replayRow.eventSequence,
            planHash: replayRow.planHash,
            graphHash: replayRow.graphHash,
            previousStateHash: replayRow.previousStateHash,
            resultStateHash: replayRow.resultStateHash,
            idempotencyKey: replayRow.idempotencyKey,
            receiptHash: replayRow.receiptHash,
            createdAt: replayRow.createdAt.toISOString(),
          });
          this.instances.set(instance.id, instance);
          this.receipts.set(receipt.id, receipt);
          return { updatedInstance: instance, receipt, replayed: true };
        }

        const current = QuestInstanceSchema.parse(JSON.parse(instanceRow.instanceJson));
        const currentHash = computeQuestStateHash(current);
        if (currentHash !== input.expectedStateHash || input.receipt.previousStateHash !== currentHash) {
          throw new Error("QUEST_RUNTIME_STALE_STATE");
        }
        const lastReceipt = (await tx.select().from(aurionQuestReceipts)
          .where(eq(aurionQuestReceipts.instanceId, input.instanceId))
          .orderBy(desc(aurionQuestReceipts.eventSequence)).limit(1))[0];
        const nextSequence = (lastReceipt?.eventSequence ?? 0) + 1;
        if (input.receipt.eventSequence !== nextSequence) throw new Error("QUEST_RUNTIME_SEQUENCE_CONFLICT");

        await tx.insert(aurionQuestReceipts).values({
          id: input.receipt.id,
          instanceId: input.receipt.instanceId,
          eventSequence: input.receipt.eventSequence,
          planHash: input.receipt.planHash,
          graphHash: input.receipt.graphHash,
          previousStateHash: input.receipt.previousStateHash,
          resultStateHash: input.receipt.resultStateHash,
          idempotencyKey: input.receipt.idempotencyKey,
          receiptHash: input.receipt.receiptHash,
        });
        await tx.update(aurionQuestInstances).set({
          currentNodeId: input.updatedInstance.currentNodeId,
          state: input.updatedInstance.state,
          instanceJson: JSON.stringify(input.updatedInstance),
        }).where(eq(aurionQuestInstances.id, input.instanceId));
        this.instances.set(input.instanceId, input.updatedInstance);
        this.receipts.set(input.receipt.id, input.receipt);
        return { updatedInstance: input.updatedInstance, receipt: input.receipt, replayed: false };
      });
    });
  }

  public async saveReceipt(raw: QuestReceipt): Promise<void> {
    const receipt = QuestReceiptSchema.parse(raw);
    if (!this.verifyReceiptIntegrity(receipt)) throw new Error(`QUEST_RECEIPT_TAMPER_DETECTED:${receipt.id}`);
    this.receipts.set(receipt.id, receipt);
    const db = await getDb();
    if (!db) return;
    const existing = (await db.select().from(aurionQuestReceipts).where(eq(aurionQuestReceipts.id, receipt.id)))[0];
    if (existing && existing.receiptHash !== receipt.receiptHash) throw new Error("QUEST_RECEIPT_REPLAY_CONFLICT");
    if (!existing) {
      await db.insert(aurionQuestReceipts).values({
        id: receipt.id,
        instanceId: receipt.instanceId,
        eventSequence: receipt.eventSequence,
        planHash: receipt.planHash,
        graphHash: receipt.graphHash,
        previousStateHash: receipt.previousStateHash,
        resultStateHash: receipt.resultStateHash,
        idempotencyKey: receipt.idempotencyKey,
        receiptHash: receipt.receiptHash,
      });
    }
  }

  public async getReceiptByIdempotencyKey(idempotencyKey: string): Promise<QuestReceipt | undefined> {
    const db = await getDb();
    if (!db) return Array.from(this.receipts.values()).find(receipt => receipt.idempotencyKey === idempotencyKey);
    const row = (await db.select().from(aurionQuestReceipts)
      .where(eq(aurionQuestReceipts.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (!row) return undefined;
    const receipt = QuestReceiptSchema.parse({
      id: row.id,
      instanceId: row.instanceId,
      eventSequence: row.eventSequence,
      planHash: row.planHash,
      graphHash: row.graphHash,
      previousStateHash: row.previousStateHash,
      resultStateHash: row.resultStateHash,
      idempotencyKey: row.idempotencyKey,
      receiptHash: row.receiptHash,
      createdAt: row.createdAt.toISOString(),
    });
    this.receipts.set(receipt.id, receipt);
    return receipt;
  }

  public async getReceiptsForInstance(instanceId: string): Promise<QuestReceipt[]> {
    const db = await getDb();
    if (!db) return Array.from(this.receipts.values()).filter(r => r.instanceId === instanceId).sort((a,b)=>a.eventSequence-b.eventSequence);
    const rows = await db.select().from(aurionQuestReceipts).where(eq(aurionQuestReceipts.instanceId, instanceId)).orderBy(aurionQuestReceipts.eventSequence);
    return rows.map(row => QuestReceiptSchema.parse({
      id: row.id,
      instanceId: row.instanceId,
      eventSequence: row.eventSequence,
      planHash: row.planHash,
      graphHash: row.graphHash,
      previousStateHash: row.previousStateHash,
      resultStateHash: row.resultStateHash,
      idempotencyKey: row.idempotencyKey,
      receiptHash: row.receiptHash,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
