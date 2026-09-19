import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  computeEffectId,
  createEffectIntent,
  verifyEffectIntent,
} from "../../shared/aurionEffectIntentContract";

const receipt = canonicalSha256({ authority: "receipt-8114" });

describe("Aurion EffectIntent contract", () => {
  it("recomputes the same effectId for the same authority receipt and ordinal", () => {
    const input = { authorityReceiptHash: receipt, effectType: "achievement.dispatch", subjectId: "player:23", ordinal: 0 };
    expect(computeEffectId(input)).toBe(computeEffectId(input));
  });

  it("changes effect identity when any authority-bound identity component changes", () => {
    const ids = new Set([
      computeEffectId({ authorityReceiptHash: receipt, effectType: "achievement.dispatch", subjectId: "player:23", ordinal: 0 }),
      computeEffectId({ authorityReceiptHash: receipt, effectType: "achievement.dispatch", subjectId: "player:23", ordinal: 1 }),
      computeEffectId({ authorityReceiptHash: receipt, effectType: "notification.dispatch", subjectId: "player:23", ordinal: 0 }),
      computeEffectId({ authorityReceiptHash: receipt, effectType: "achievement.dispatch", subjectId: "player:24", ordinal: 0 }),
    ]);
    expect(ids.size).toBe(4);
  });

  it("rejects secret-like fields before an EffectIntent can enter evidence", () => {
    expect(() => createEffectIntent({
      authorityReceiptHash: receipt,
      effectType: "notification.dispatch",
      subjectId: "player:23",
      ordinal: 0,
      payload: { apiToken: "must-never-enter-evidence" },
    })).toThrow("EFFECT_PAYLOAD_SENSITIVE_FIELD_FORBIDDEN");
  });

  it("binds payload content without putting delivery status into gameplay identity", () => {
    const intent = createEffectIntent({
      authorityReceiptHash: receipt,
      effectType: "achievement.dispatch",
      subjectId: "player:23",
      ordinal: 0,
      payload: { achievementId: "first-light" },
    });
    expect(verifyEffectIntent(intent)).toBe(true);
    expect(verifyEffectIntent({ ...intent, payload: { achievementId: "forged" } })).toBe(false);
  });
});
