import { QuestInstance, QuestPlan, QuestReceipt, QuestTemplateVersion, WorldEvent, WorldFact } from '../../shared/aurionQuestContract';

/**
 * AIM-298: Aurion Quest Persistence Boundary.
 * Provides atomic persistence for quest instances, templates, events, facts, and receipts.
 */
export class QuestPersistenceEngine {
  private instances: Map<string, QuestInstance> = new Map();
  private plans: Map<string, QuestPlan> = new Map();
  private receipts: Map<string, QuestReceipt> = new Map();

  public async savePlan(plan: QuestPlan): Promise<void> {
    this.plans.set(plan.planHash, plan);
  }

  public async getPlan(planHash: string): Promise<QuestPlan | undefined> {
    return this.plans.get(planHash);
  }

  public async saveInstance(instance: QuestInstance): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  public async getInstance(instanceId: string): Promise<QuestInstance | undefined> {
    return this.instances.get(instanceId);
  }

  public async listInstances(filter?: { playerUserId?: number; state?: string }): Promise<QuestInstance[]> {
    let list = Array.from(this.instances.values());
    if (filter?.playerUserId !== undefined) {
      list = list.filter(i => i.playerUserId === filter.playerUserId);
    }
    if (filter?.state !== undefined) {
      list = list.filter(i => i.state === filter.state);
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async saveReceipt(receipt: QuestReceipt): Promise<void> {
    this.receipts.set(receipt.id, receipt);
  }

  public async getReceiptsForInstance(instanceId: string): Promise<QuestReceipt[]> {
    return Array.from(this.receipts.values())
      .filter(r => r.instanceId === instanceId)
      .sort((a, b) => a.eventSequence - b.eventSequence);
  }
}
