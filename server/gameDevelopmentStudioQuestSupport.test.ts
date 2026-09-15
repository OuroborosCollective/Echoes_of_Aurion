import { describe, expect, it } from 'vitest';
import { GameDevelopmentStudioQuestSupport } from './gameDevelopmentStudioQuestSupport';

describe('GameDevelopmentStudioQuestSupport (AIM-298)', () => {
  it('generates a valid visual support receipt bound to Game Dev 1.0.2', async () => {
    const receipt = await GameDevelopmentStudioQuestSupport.generateVisualSupportReceipt(
      'tpl_caravan_investigation:v1',
      [
        { assetId: 'npc_merchant_kaelen', purpose: 'giver_npc' },
        { assetId: 'item_damaged_manifest', purpose: 'prop_item' },
      ]
    );

    expect(receipt.schemaVersion).toBe('aurion.quest-visual-support.v1');
    expect(receipt.templateVersionId).toBe('tpl_caravan_investigation:v1');
    expect(receipt.gameDevelopmentStudio.version).toBe('1.0.2');
    expect(receipt.gameDevelopmentStudio.sourceRevision).toBe('96a0b4f34b979279ab983e9547af43133e85f310');
    expect(receipt.providerCalls).toBe(false);
    expect(receipt.assets).toHaveLength(2);
    expect(receipt.assetSetHash).toBeTruthy();
  });
});
