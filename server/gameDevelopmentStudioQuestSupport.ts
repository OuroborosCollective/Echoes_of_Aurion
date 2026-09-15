import { computeCanonicalHash } from '../shared/aurionQuestCanonicalHash';
import { inspectApprovedAsset } from './gameDevelopmentStudioRuntime';

export interface QuestVisualAssetRequest {
  assetId: string;
  purpose: 'giver_npc' | 'victim_npc' | 'antagonist_npc' | 'prop_item' | 'location_landmark';
}

export interface QuestVisualAssetReport {
  assetId: string;
  sha256: string;
  purpose: string;
  inspectResultSha256?: string;
  validateResultSha256?: string;
  verdict: 'valid' | 'invalid' | 'unavailable';
}

export interface QuestVisualSupportReceipt {
  schemaVersion: 'aurion.quest-visual-support.v1';
  templateVersionId: string;
  assetSetHash: string;
  assets: QuestVisualAssetReport[];
  gameDevelopmentStudio: {
    version: '1.0.2';
    sourceRevision: '96a0b4f34b979279ab983e9547af43133e85f310';
  };
  providerCalls: false;
}

/**
 * AIM-298: Game Development Studio Visual Support Bridge.
 * Receives approved asset IDs for quest templates/instances, resolves them through the approved GLB catalog,
 * calls safe asset inspection/validation, and emits immutable visual support receipts.
 */
export class GameDevelopmentStudioQuestSupport {
  public static readonly GAME_DEV_VERSION = '1.0.2';
  public static readonly GAME_DEV_SOURCE_REVISION = '96a0b4f34b979279ab983e9547af43133e85f310';

  public static async generateVisualSupportReceipt(
    templateVersionId: string,
    assetRequests: QuestVisualAssetRequest[]
  ): Promise<QuestVisualSupportReceipt> {
    const assetReports: QuestVisualAssetReport[] = [];

    for (const req of assetRequests) {
      try {
        const inspectRes = await inspectApprovedAsset('inspect', req.assetId).catch(() => null);
        if (inspectRes && inspectRes.asset) {
          const validateRes = await inspectApprovedAsset('validate', req.assetId).catch(() => null);
          const inspectHash = computeCanonicalHash('aurion.quest.template.v1', inspectRes);
          const validateHash = validateRes ? computeCanonicalHash('aurion.quest.template.v1', validateRes) : undefined;
          const assetInfo = inspectRes.asset as Record<string, any>;

          assetReports.push({
            assetId: req.assetId,
            sha256: assetInfo.sha256 || 'sha256_catalog_asset',
            purpose: req.purpose,
            inspectResultSha256: inspectHash,
            validateResultSha256: validateHash,
            verdict: validateRes ? 'valid' : 'invalid',
          });
        } else {
          assetReports.push({
            assetId: req.assetId,
            sha256: 'sha256_unavailable',
            purpose: req.purpose,
            verdict: 'unavailable',
          });
        }
      } catch {
        assetReports.push({
          assetId: req.assetId,
          sha256: 'sha256_unavailable',
          purpose: req.purpose,
          verdict: 'unavailable',
        });
      }
    }

    const assetSetHash = computeCanonicalHash('aurion.quest.template.v1', assetReports);

    return {
      schemaVersion: 'aurion.quest-visual-support.v1',
      templateVersionId,
      assetSetHash,
      assets: assetReports,
      gameDevelopmentStudio: {
        version: this.GAME_DEV_VERSION,
        sourceRevision: this.GAME_DEV_SOURCE_REVISION,
      },
      providerCalls: false,
    };
  }
}
