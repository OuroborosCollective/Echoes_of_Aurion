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
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
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

  private templateKey(templateId: string, version: number) { return `${templateId}:v${version}`; }

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

  public async saveReceipt(raw: QuestReceipt): Promise<void> {
    const receipt = QuestReceiptSchema.parse(raw);
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
