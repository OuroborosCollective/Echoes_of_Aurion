import { describe, expect, it } from 'vitest';
import { adminQuestService, aurionQuestRouter } from '../routes/aurionQuestRouter';
import { GameDevelopmentStudioQuestSupport } from '../gameDevelopmentStudioQuestSupport';
import { WorldFactEngine } from './worldFacts';
import { QuestTemplateRegistry } from './templateRegistry';
import { QuestRuntimeEngine } from './runtime';
import { QuestPersistenceEngine } from './persistence';

describe('Aurion Quest Router & Admin Integration (AIM-298)', () => {
  it('fetches status via adminQuestService', async () => {
    const status = await adminQuestService.getStatus();
    expect(status.compilerVersion).toBe('1.0.0');
    expect(status.schemaVersion).toBe('aurion.quest.v1');
    expect(status.activeTemplateSetHash).toHaveLength(64);
    expect(status.activeTemplatesCount).toBeGreaterThanOrEqual(2);
  });

  it('lists registered templates', async () => {
    const templates = await adminQuestService.getTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.some((t: any) => t.templateId === 'tpl_caravan_investigation')).toBe(true);
  });

  it('fetches world facts', async () => {
    const facts = await adminQuestService.getWorldFacts();
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });

  it('lists quest instances and replays instance deterministically', async () => {
    // Own a full-pool compiler fixture; unrelated database rows are not this
    // service's source-event evidence and must never be selected by list order.
    const facts = new WorldFactEngine();
    facts.recordEvent({ id: 'evt_init_caravan', type: 'CARAVAN_ATTACKED', source: 'aurion_system_seed',
      data: { caravanId: 'caravan_alpha', merchantId: 'npc_merchant_kaelen', playerUserId: '1' } });
    const templates = new QuestTemplateRegistry();
    for (const template of await adminQuestService.getTemplates()) templates.registerTemplate(template);
    const { instance, plan } = new QuestRuntimeEngine(facts, templates).compileAndOfferQuest({
      worldId: 'router_replay_fixture', playerUserId: 2_146_999_991, triggerEventId: 'evt_init_caravan',
    });
    const persistence: QuestPersistenceEngine = Reflect.get(adminQuestService, "persistenceEngine");
    await persistence.savePlan(plan);
    await persistence.saveInstance(instance);
    const instances = await adminQuestService.listInstances({ playerUserId: instance.playerUserId });
    expect(instances.some(candidate => candidate.id === instance.id)).toBe(true);

    const replayResult = await adminQuestService.replayInstance(instance.id);
    expect(replayResult.verdict).toBe('MATCH');
    expect(replayResult.replayedPlanHash).toBe(instance.planHash);
  });

  it('creates draft proposal without direct mutation', async () => {
    const proposal = await adminQuestService.createDraftProposal({
      authorUserId: 42,
      templateId: 'tpl_caravan_investigation',
      templateVersion: 2,
      proposedDataJson: JSON.stringify({ title: 'Caravan Ambush v2', description: 'Updated version' }),
    });

    expect(proposal.proposalType).toBe('create_template_draft');
    expect(proposal.authorUserId).toBe(42);
    expect(proposal.status).toBe('draft');
    expect(proposal.receiptHash).toHaveLength(64);
  });

  it('generates visual support receipt via Game Development Studio 1.0.2', async () => {
    const receipt = await GameDevelopmentStudioQuestSupport.generateVisualSupportReceipt(
      'tpl_caravan_investigation:v1',
      [
        { assetId: 'npc_merchant_kaelen', purpose: 'giver_npc' },
        { assetId: 'item_damaged_manifest', purpose: 'prop_item' },
      ]
    );

    expect(receipt.schemaVersion).toBe('aurion.quest-visual-support.v1');
    expect(receipt.gameDevelopmentStudio.version).toBe('1.0.2');
    expect(receipt.gameDevelopmentStudio.sourceRevision).toBe('96a0b4f34b979279ab983e9547af43133e85f310');
    expect(receipt.assetSetHash).toHaveLength(64);
    expect(receipt.assets).toHaveLength(2);
  });
});
