import type { ParticleEffectType } from "../core/ParticleSystem";

/** A visual consumer of successful gameplay receipts; it cannot change game state. */
export class ConfirmedVisualEffects {
  private readonly sequences = new Map<string, number>();

  accept(input: unknown): { kind: ParticleEffectType; receiptKey: string } | null {
    if (!input || typeof input !== "object") return null;
    const value = input as Record<string, unknown>;
    if (typeof value.sessionId !== "string" || !/^[A-Za-z0-9_.:-]{8,64}$/.test(value.sessionId)
      || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1
      || !Number.isSafeInteger(value.damage) || (value.damage as number) < 0
      || !Number.isSafeInteger(value.bossHp) || (value.bossHp as number) < 0
      || typeof value.completed !== "boolean" || value.completed !== (value.bossHp === 0)
      || typeof value.command !== "string" || !/^[WASDEF1-9]$/.test(value.command.toUpperCase())) return null;
    const prior = this.sequences.get(value.sessionId) ?? 0;
    if ((value.sequence as number) <= prior) return null;
    if (!this.sequences.has(value.sessionId) && this.sequences.size >= 32) this.sequences.delete(this.sequences.keys().next().value!);
    this.sequences.set(value.sessionId, value.sequence as number);
    if (value.damage === 0) return null;
    return { kind: value.completed ? "explosion" : "combat_hit", receiptKey: `${value.sessionId}:${value.sequence}` };
  }
}
