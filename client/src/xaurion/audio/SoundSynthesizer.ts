// Owner ZIP compatibility adapter: preserve the xaurion sound API while routing every cue into AurionSoundscape.
type AurionAudioDetail =
  | { cue: "combat.spell.buff" | "combat.magic" | "combat.attack.blade" | "combat.monster"; category: "combat"; element?: string; weapon?: string; monsterClass?: string }
  | { cue: "interaction.loot.screw_pouch" | "interaction.npc.neutral"; category: "interaction"; voice?: "neutral" }
  | { cue: "progression.level_up"; category: "progression"; level?: number };

class SoundSynthesizer {
  private isMuted = false;

  private emit(detail: AurionAudioDetail): void {
    if (this.isMuted || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail }));
  }

  public setMuted(muted: boolean): void { this.isMuted = muted; }
  public getMuted(): boolean { return this.isMuted; }
  public startShieldSound(): void { this.emit({ cue: "combat.spell.buff", category: "combat", element: "resonance" }); }
  public stopShieldSound(): void {}
  public playMountSound(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playLootPickup(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playNpcInteract(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playSkillCast(type: string): void {
    this.emit(type === "buff"
      ? { cue: "combat.spell.buff", category: "combat", element: "resonance" }
      : type === "melee"
        ? { cue: "combat.attack.blade", category: "combat", weapon: "blade" }
        : { cue: "combat.magic", category: "combat", element: "resonance" });
  }
  public playHitSound(): void { this.emit({ cue: "combat.attack.blade", category: "combat", weapon: "blade" }); }
  public playMobDeath(): void { this.emit({ cue: "combat.monster", category: "combat", monsterClass: "xaurion" }); }
  public playLevelUp(): void { this.emit({ cue: "progression.level_up", category: "progression", level: 1 }); }
  public playQuestComplete(): void { this.emit({ cue: "progression.level_up", category: "progression", level: 1 }); }
  public playItemEquip(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playItemPickup(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playInventorySort(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
}

export const soundSynth = new SoundSynthesizer();
