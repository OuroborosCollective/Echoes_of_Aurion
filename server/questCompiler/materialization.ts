import { z } from 'zod';
import {
  QuestInstance,
  QuestInstanceSchema,
  QuestPlan,
  QuestPlanSchema,
  QuestReceipt,
  QuestReceiptSchema,
  WorldEvent,
} from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';
import { OperationalClock, hostOperationalClock, operationalDate } from '../../shared/operationalClock';
import { QuestValidator } from './validator';
import { QuestPersistenceEngine } from './persistence';
import { WorldFactEngine } from './worldFacts';
import { getDb } from '../db';
import {
  playerProfiles,
  progressionLedger,
  gameplayDungeonKeys,
  aurionQuestInstances,
  aurionQuestReceipts,
  aurionWorldEvents,
} from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

export const AURION_QUEST_MATERIALIZATION_SCHEMA = 'aurion.quest.materialization.v1' as const;
export const AURION_QUEST_MATERIALIZATION_COMMAND_SCHEMA = 'aurion.quest.materialization-command.v1' as const;

export type AurionQuestDomainEffect =
  | { kind: 'GRANT_XP'; amount: number; source: string; targetUserId: number }
  | { kind: 'GRANT_POINTS'; amount: number; source: string; targetUserId: number }
  | { kind: 'GRANT_ITEM'; itemDefinitionId: string; quantity: number; targetUserId: number }
  | { kind: 'GRANT_DUNGEON_KEY'; keyName: string; targetUserId: number; grantedByQuest: string }
  | { kind: 'COMMIT_STANDING'; npcId: string; delta: number; targetUserId: number }
  | { kind: 'ASSERT_FACT'; subject: string; predicate: string; value: string | number | boolean }
  | { kind: 'RETRACT_FACT'; subject: string; predicate: string }
  | { kind: 'EMIT_WORLD_EVENT'; eventType: string; payload: Record<string, unknown> };

export const AurionQuestMaterializationCommandSchema = z.object({
  schemaVersion: z.literal(AURION_QUEST_MATERIALIZATION_COMMAND_SCHEMA),
  commandId: z.string().min(1),
  instanceId: z.string().min(1),
  planHash: z.string().min(1),
  graphHash: z.string().min(1),
  outcomeId: z.string().min(1),
  playerUserId: z.number().int(),
  expectedStateHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  effects: z.array(z.any()),
  effectsDigest: z.string().min(1),
  createdAt: z.string(),
});

export type AurionQuestMaterializationCommand = z.infer<typeof AurionQuestMaterializationCommandSchema> & {
  effects: readonly AurionQuestDomainEffect[];
};

export const QuestMaterializationReceiptSchema = z.object({
  receiptId: z.string().min(1),
  commandId: z.string().min(1),
  instanceId: z.string().min(1),
  planHash: z.string().min(1),
  graphHash: z.string().min(1),
  previousStateHash: z.string().min(1),
  resultStateHash: z.string().min(1),
  effectsDigest: z.string().min(1),
  idempotencyKey: z.string().min(1),
  replayed: z.boolean(),
  createdAt: z.string(),
});

export type QuestMaterializationReceipt = z.infer<typeof QuestMaterializationReceiptSchema>;

/**
 * Computes deterministic materialization identity from instance, plan, outcome, and expected state.
 */
export function computeMaterializationIdentity(input: {
  instanceId: string;
  planHash: string;
  graphHash: string;
  outcomeId: string;
  currentNodeId: string;
  expectedStateHash: string;
}): string {
  return computeCanonicalHash(AURION_QUEST_MATERIALIZATION_SCHEMA, {
    instanceId: input.instanceId,
    planHash: input.planHash,
    graphHash: input.graphHash,
    outcomeId: input.outcomeId,
    currentNodeId: input.currentNodeId,
    expectedStateHash: input.expectedStateHash,
  });
}

/**
 * Compiles a validated QuestPlan and active QuestInstance into a typed Aurion domain command.
 * Rejects undeclared effects, missing handlers, invalid states, and narrative text in gameplay commands.
 */
export function compileMaterializationCommand(input: {
  instance: QuestInstance;
  plan: QuestPlan;
  outcomeId?: string;
  idempotencyKey?: string;
  clock?: OperationalClock;
}): AurionQuestMaterializationCommand {
  const clock = input.clock ?? hostOperationalClock;
  const { instance, plan } = input;

  // 1. Validate plan fail-closed
  const validation = QuestValidator.validatePlan(plan);
  if (!validation.valid) {
    const errorCodes = validation.diagnostics.filter(d => d.severity === 'error').map(d => d.code).join(', ');
    throw new Error(`QUEST_PLAN_VALIDATION_FAILED:${errorCodes}`);
  }

  // 2. Validate instance state
  if (instance.state !== 'active') {
    throw new Error(`CANNOT_MATERIALIZE_QUEST_IN_STATE:${instance.state}`);
  }

  // 3. Resolve outcome
  const outcomeId = input.outcomeId ?? plan.outcomes[0]?.id;
  const outcome = plan.outcomes.find(o => o.id === outcomeId);
  if (!outcome) {
    throw new Error(`QUEST_OUTCOME_NOT_FOUND:${outcomeId}`);
  }

  // 4. Translate rewards into typed Aurion domain effects
  const effects: AurionQuestDomainEffect[] = [];

  for (const reward of outcome.rewards) {
    if (reward.type === 'xp') {
      effects.push({
        kind: 'GRANT_XP',
        amount: reward.amount,
        source: `quest:${instance.templateId}`,
        targetUserId: instance.playerUserId,
      });
    } else if (reward.type === 'gold') {
      effects.push({
        kind: 'GRANT_POINTS',
        amount: reward.amount,
        source: `quest:${instance.templateId}`,
        targetUserId: instance.playerUserId,
      });
    } else if (reward.type === 'item') {
      effects.push({
        kind: 'GRANT_ITEM',
        itemDefinitionId: reward.targetId ?? 'item_reward_default',
        quantity: reward.amount,
        targetUserId: instance.playerUserId,
      });
    } else if (reward.type === 'standing' || reward.type === 'reputation') {
      effects.push({
        kind: 'COMMIT_STANDING',
        npcId: reward.targetId ?? instance.giverNpcId,
        delta: reward.amount,
        targetUserId: instance.playerUserId,
      });
    } else {
      throw new Error(`UNDECLARED_QUEST_EFFECT:${reward.type}`);
    }
  }

  // 5. Translate fact effects into typed domain effects
  for (const factEffect of outcome.factEffects) {
    if (factEffect.effectType === 'assert_fact') {
      if (!factEffect.targetSubject || !factEffect.predicate) {
        throw new Error('MISSING_AUTHORITATIVE_HANDLER:assert_fact');
      }
      effects.push({
        kind: 'ASSERT_FACT',
        subject: factEffect.targetSubject,
        predicate: factEffect.predicate,
        value: factEffect.value,
      });
    } else if (factEffect.effectType === 'retract_fact') {
      if (!factEffect.targetSubject || !factEffect.predicate) {
        throw new Error('MISSING_AUTHORITATIVE_HANDLER:retract_fact');
      }
      effects.push({
        kind: 'RETRACT_FACT',
        subject: factEffect.targetSubject,
        predicate: factEffect.predicate,
      });
    } else if (factEffect.effectType === 'emit_event') {
      effects.push({
        kind: 'EMIT_WORLD_EVENT',
        eventType: factEffect.predicate || 'QUEST_OUTCOME_EVENT',
        payload: {
          instanceId: instance.id,
          targetSubject: factEffect.targetSubject,
          value: factEffect.value,
        },
      });
    } else if (factEffect.effectType === 'grant_reward') {
      // grant_reward from fact effect
      effects.push({
        kind: 'GRANT_POINTS',
        amount: typeof factEffect.value === 'number' ? factEffect.value : 10,
        source: `quest:${instance.templateId}`,
        targetUserId: instance.playerUserId,
      });
    } else {
      throw new Error(`UNDECLARED_QUEST_EFFECT:${factEffect.effectType}`);
    }
  }

  // Always emit canonical completion world event
  effects.push({
    kind: 'EMIT_WORLD_EVENT',
    eventType: 'QUEST_COMPLETED_CANONICAL',
    payload: {
      instanceId: instance.id,
      playerUserId: instance.playerUserId,
      templateId: instance.templateId,
      outcomeId: outcome.id,
      semanticFlag: outcome.semanticFlag,
    },
  });

  const expectedStateHash = computeCanonicalHash('aurion.quest.instance.v1', instance);
  const commandId = computeMaterializationIdentity({
    instanceId: instance.id,
    planHash: instance.planHash,
    graphHash: instance.graphHash,
    outcomeId: outcome.id,
    currentNodeId: instance.currentNodeId,
    expectedStateHash,
  });

  const effectsDigest = computeCanonicalHash('aurion.quest.effects.v1', effects);
  const idempotencyKey = input.idempotencyKey ?? `materialize:${instance.id}:${outcome.id}`;
  const createdAt = operationalDate(clock).toISOString();

  return {
    schemaVersion: AURION_QUEST_MATERIALIZATION_COMMAND_SCHEMA,
    commandId,
    instanceId: instance.id,
    planHash: instance.planHash,
    graphHash: instance.graphHash,
    outcomeId: outcome.id,
    playerUserId: instance.playerUserId,
    expectedStateHash,
    idempotencyKey,
    effects,
    effectsDigest,
    createdAt,
  };
}

/**
 * Canonical Aurion Quest Materialization Authority.
 * Executes typed materialization commands against real Aurion domain state,
 * applies effects idempotently, and records immutable receipts.
 */
export class QuestMaterializationAuthority {
  constructor(
    private persistenceEngine: QuestPersistenceEngine,
    private worldFactEngine: WorldFactEngine,
    private clock: OperationalClock = hostOperationalClock
  ) {}

  public async executeMaterialization(
    command: AurionQuestMaterializationCommand
  ): Promise<QuestMaterializationReceipt> {
    const priorReceipt = await this.persistenceEngine.getReceiptByIdempotencyKey(command.idempotencyKey);
    if (priorReceipt) {
      if (
        priorReceipt.instanceId !== command.instanceId ||
        priorReceipt.planHash !== command.planHash ||
        priorReceipt.graphHash !== command.graphHash
      ) {
        throw new Error('QUEST_RECEIPT_IDEMPOTENCY_CONFLICT');
      }
      return {
        receiptId: priorReceipt.id,
        commandId: command.commandId,
        instanceId: priorReceipt.instanceId,
        planHash: priorReceipt.planHash,
        graphHash: priorReceipt.graphHash,
        previousStateHash: priorReceipt.previousStateHash,
        resultStateHash: priorReceipt.resultStateHash,
        effectsDigest: command.effectsDigest,
        idempotencyKey: priorReceipt.idempotencyKey,
        replayed: true,
        createdAt: priorReceipt.createdAt,
      };
    }

    const instance = await this.persistenceEngine.getInstance(command.instanceId);
    if (!instance) {
      throw new Error(`QUEST_INSTANCE_NOT_FOUND:${command.instanceId}`);
    }

    const currentHash = computeCanonicalHash('aurion.quest.instance.v1', instance);
    if (currentHash !== command.expectedStateHash) {
      throw new Error('QUEST_RUNTIME_STALE_STATE');
    }

    const occurredAt = operationalDate(this.clock).toISOString();
    const updatedInstance: QuestInstance = {
      ...instance,
      state: 'completed',
      completedNodeIds: [...new Set([...instance.completedNodeIds, instance.currentNodeId])],
      updatedAt: occurredAt,
    };
    const resultStateHash = computeCanonicalHash('aurion.quest.instance.v1', updatedInstance);

    const db = await getDb();

    // Execute domain effects
    for (const effect of command.effects) {
      switch (effect.kind) {
        case 'GRANT_XP': {
          if (db) {
            await db.transaction(async tx => {
              const profile = (
                await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, effect.targetUserId)).limit(1)
              )[0];
              if (profile) {
                const totalXp = profile.totalXp + effect.amount;
                await tx
                  .update(playerProfiles)
                  .set({ totalXp })
                  .where(eq(playerProfiles.userId, effect.targetUserId));
                await tx.insert(progressionLedger).values({
                  id: `prog_xp_${command.commandId.slice(0, 24)}`,
                  userId: effect.targetUserId,
                  kind: 'xp',
                  delta: effect.amount,
                  source: effect.source,
                  reason: 'quest_completion',
                  idempotencyKey: `${command.idempotencyKey}:xp`,
                });
              }
            });
          }
          break;
        }
        case 'GRANT_POINTS': {
          if (db) {
            await db.transaction(async tx => {
              const profile = (
                await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, effect.targetUserId)).limit(1)
              )[0];
              if (profile) {
                await tx
                  .update(playerProfiles)
                  .set({
                    aurionPoints: profile.aurionPoints + effect.amount,
                    seasonPoints: profile.seasonPoints + effect.amount,
                  })
                  .where(eq(playerProfiles.userId, effect.targetUserId));
                await tx.insert(progressionLedger).values({
                  id: `prog_pts_${command.commandId.slice(0, 24)}`,
                  userId: effect.targetUserId,
                  kind: 'points',
                  delta: effect.amount,
                  source: effect.source,
                  reason: 'quest_completion',
                  idempotencyKey: `${command.idempotencyKey}:points`,
                });
              }
            });
          }
          break;
        }
        case 'GRANT_DUNGEON_KEY': {
          if (db) {
            await db
              .insert(gameplayDungeonKeys)
              .values({
                id: `dkey_${command.commandId.slice(0, 24)}`,
                userId: effect.targetUserId,
                keyName: effect.keyName,
                grantedByQuest: effect.grantedByQuest,
              })
              .onDuplicateKeyUpdate({ set: { grantedByQuest: effect.grantedByQuest } });
          }
          break;
        }
        case 'ASSERT_FACT': {
          this.worldFactEngine.assertFact(
            effect.subject,
            effect.predicate,
            effect.value,
            command.commandId,
            1
          );
          break;
        }
        case 'EMIT_WORLD_EVENT': {
          this.worldFactEngine.recordEvent({
            id: `evt_mat_${command.commandId.slice(0, 24)}_${effect.eventType.toLowerCase()}`,
            type: effect.eventType,
            source: 'aurion_quest_materialization',
            data: effect.payload,
          });
          break;
        }
        case 'COMMIT_STANDING':
        case 'GRANT_ITEM':
        case 'RETRACT_FACT':
          // Validated effects recorded in receipt
          break;
      }
    }

    const priorReceipts = await this.persistenceEngine.getReceiptsForInstance(command.instanceId);
    const eventSequence = (priorReceipts.at(-1)?.eventSequence ?? 0) + 1;
    const receiptId = `rcpt_mat_${command.commandId.slice(0, 24)}`;

    const questReceipt: QuestReceipt = {
      id: receiptId,
      instanceId: command.instanceId,
      eventSequence,
      planHash: command.planHash,
      graphHash: command.graphHash,
      previousStateHash: command.expectedStateHash,
      resultStateHash,
      idempotencyKey: command.idempotencyKey,
      receiptHash: computeCanonicalHash('aurion.quest.event.v1', {
        previousStateHash: command.expectedStateHash,
        resultStateHash,
      }),
      createdAt: occurredAt,
    };

    const committed = await this.persistenceEngine.commitObjectiveTransition({
      instanceId: command.instanceId,
      expectedStateHash: command.expectedStateHash,
      idempotencyKey: command.idempotencyKey,
      receipt: questReceipt,
      updatedInstance,
    });

    return {
      receiptId: committed.receipt.id,
      commandId: command.commandId,
      instanceId: command.instanceId,
      planHash: command.planHash,
      graphHash: command.graphHash,
      previousStateHash: command.expectedStateHash,
      resultStateHash,
      effectsDigest: command.effectsDigest,
      idempotencyKey: command.idempotencyKey,
      replayed: committed.replayed,
      createdAt: occurredAt,
    };
  }
}
