import {
  QuestDomainCommandSchema,
  AURION_QUEST_DOMAIN_COMMAND_SCHEMA,
  type QuestDomainCommand,
} from "../../shared/aurionQuestDomainCommandContract";
import { type QuestInstance, type QuestPlan } from "../../shared/aurionQuestContract";
import { computeCanonicalHash, computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";

type MaterializationInput =
  Omit<QuestDomainCommand, "commandId" | "schemaVersion">;

export function materializeQuestDomainCommand(
  instance: QuestInstance,
  plan: QuestPlan,
  input: MaterializationInput,
): QuestDomainCommand {
  if (instance.id !== input.instanceId) {
    throw new Error("QUEST_MATERIALIZATION_INSTANCE_MISMATCH");
  }
  if (instance.planHash !== input.planHash || instance.graphHash !== input.graphHash) {
    throw new Error("QUEST_MATERIALIZATION_PLAN_MISMATCH");
  }

  const expectedStateHash = computeQuestStateHash(instance);
  if (expectedStateHash !== input.expectedStateHash) {
    throw new Error("QUEST_MATERIALIZATION_STALE_STATE");
  }

  const identityPayload = {
    schemaVersion: AURION_QUEST_DOMAIN_COMMAND_SCHEMA,
    ...input,
  };
  const commandId = computeCanonicalHash("aurion.quest.command.v1", identityPayload);

  return QuestDomainCommandSchema.parse({
    ...identityPayload,
    commandId,
  });
}
