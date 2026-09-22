import {
  QuestDomainCommandSchema,
  AURION_QUEST_DOMAIN_COMMAND_SCHEMA,
  type QuestDomainCommand,
} from "../../shared/aurionQuestDomainCommandContract";
import { type QuestInstance, type QuestPlan } from "../../shared/aurionQuestContract";
import { computeCanonicalHash, computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";

export type QuestDomainCommandInput =
  | Omit<Extract<QuestDomainCommand, { kind: "accept" }>, "commandId" | "schemaVersion">
  | Omit<Extract<QuestDomainCommand, { kind: "progress" }>, "commandId" | "schemaVersion">
  | Omit<Extract<QuestDomainCommand, { kind: "choice" }>, "commandId" | "schemaVersion">
  | Omit<Extract<QuestDomainCommand, { kind: "complete" }>, "commandId" | "schemaVersion">;

export function materializeQuestDomainCommand(
  instance: QuestInstance,
  plan: QuestPlan,
  input: QuestDomainCommandInput,
): QuestDomainCommand {
  if (instance.id !== input.instanceId) {
    throw new Error("QUEST_MATERIALIZATION_INSTANCE_MISMATCH");
  }
  if (
    instance.planHash !== input.planHash ||
    instance.graphHash !== input.graphHash ||
    plan.planHash !== instance.planHash ||
    plan.graphHash !== instance.graphHash
  ) {
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
