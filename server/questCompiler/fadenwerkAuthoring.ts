import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { inspectFadenwerk, toQuarantinedQuestTemplate } from "../../shared/fadenwerkLegacyAdapter";
import { QuestTemplateVersionSchema } from "../../shared/aurionQuestContract";

/** Read-only authoring conversion. No proposal, publication, receipt or gameplay write. */
export function inspectFadenwerkSource(sourceJson: string) {
  if (Buffer.byteLength(sourceJson, "utf8") > 120_000) throw new TRPCError({ code: "BAD_REQUEST", message: "FADENWERK_SOURCE_TOO_LARGE" });
  try {
    return { sourceHash: createHash("sha256").update(sourceJson, "utf8").digest("hex"), ...inspectFadenwerk(JSON.parse(sourceJson)) };
  } catch {
    // Never reflect raw imported content or parser text into server diagnostics.
    throw new TRPCError({ code: "BAD_REQUEST", message: "FADENWERK_DOCUMENT_INVALID" });
  }
}

export function fadenwerkInspection(sourceJson: string) {
  const checked = inspectFadenwerkSource(sourceJson);
  const result = { previewOnly: true as const, sourceHash: checked.sourceHash,
    questlines: checked.questlines.map(line => ({ id: line.id, title: line.title, issues: line.issues })) };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 120_000) throw new TRPCError({ code: "BAD_REQUEST", message: "FADENWERK_INSPECTION_TOO_LARGE" });
  return result;
}

export function fadenwerkDraft(sourceJson: string, questlineIndex: number, version: number) {
  const checked = inspectFadenwerkSource(sourceJson);
  const line = checked.questlines[questlineIndex];
  if (!line || line.issues.some(issue => issue.severity === "blocker")) throw new TRPCError({ code: "BAD_REQUEST", message: "FADENWERK_UNMAPPED" });
  const template = QuestTemplateVersionSchema.parse(toQuarantinedQuestTemplate(line, version));
  if (Buffer.byteLength(JSON.stringify(template), "utf8") > 120_000) throw new TRPCError({ code: "BAD_REQUEST", message: "FADENWERK_DRAFT_TOO_LARGE" });
  return { previewOnly: true as const, sourceHash: checked.sourceHash, questlineId: line.id, template };
}
