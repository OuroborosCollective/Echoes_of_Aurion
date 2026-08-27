import type { AudioEvent, AudioCueId, AudioSurface } from "@shared/audioProtocol";

type LegacyCue = "system" | "command" | "combat" | "connection" | "warning" | "victory";
type BusName = "ambient" | "interaction" | "combat" | "movement" | "progression";

type CueSpec = { frequency: number; duration: number; type: OscillatorType; gain: number; slide?: number; noise?: boolean };

const LEGACY_CUES: Record<LegacyCue, AudioCueId> = {
  system: "interaction.npc.neutral",
  command: "interaction.npc.neutral",
  combat: "combat.monster",
  connection: "progression.level_up",
  warning: "combat.magic",
  victory: "progression.level_up",
};

const BUS_GAIN: Record<BusName, number> = { ambient: 0.06, interaction: 0.08, combat: 0.09, movement: 0.045, progression: 0.1 };

const CUES: Partial<Record<AudioCueId, CueSpec>> = {
  "interaction.npc.masculine": { frequency: 196, duration: 0.12, type: "triangle", gain: 0.55 },
  "interaction.npc.feminine": { frequency: 440, duration: 0.12, type: "sine", gain: 0.55 },
  "interaction.npc.neutral": { frequency: 330, duration: 0.1, type: "triangle", gain: 0.5 },
  "combat.monster": { frequency: 126, duration: 0.18, type: "sawtooth", gain: 0.62, slide: 64, noise: true },
  "combat.magic": { frequency: 330, duration: 0.3, type: "sine", gain: 0.52, slide: 880 },
  "combat.attack.blade": { frequency: 180, duration: 0.11, type: "sawtooth", gain: 0.62, slide: 70, noise: true },
  "combat.attack.staff": { frequency: 240, duration: 0.2, type: "triangle", gain: 0.54, slide: 520 },
  "combat.attack.spear": { frequency: 210, duration: 0.13, type: "square", gain: 0.5, slide: 110, noise: true },
  "combat.attack.focus": { frequency: 520, duration: 0.23, type: "sine", gain: 0.5, slide: 1040 },
  "movement.footstep.earth": { frequency: 92, duration: 0.07, type: "triangle", gain: 0.32, noise: true },
  "movement.footstep.grass": { frequency: 180, duration: 0.055, type: "sine", gain: 0.22, noise: true },
  "movement.footstep.stone": { frequency: 540, duration: 0.06, type: "square", gain: 0.27, noise: true },
  "movement.footstep.wood": { frequency: 145, duration: 0.08, type: "triangle", gain: 0.3, noise: true },
  "movement.footstep.water": { frequency: 260, duration: 0.12, type: "sine", gain: 0.25, noise: true },
  "progression.level_up": { frequency: 523.25, duration: 0.42, type: "sine", gain: 0.72, slide: 1046.5 },
};

const busFor = (cue: AudioCueId): BusName => cue.split(".")[0] as BusName;

export class AurionSoundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<BusName, GainNode>();
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientUrl: string | null = null;
  private recent = new Map<string, number>();

  constructor(private readonly assetUrls: Partial<Record<AudioCueId, string>> = {}) {}

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.78;
      this.master.connect(this.context.destination);
      (Object.keys(BUS_GAIN) as BusName[]).forEach((name) => {
        const bus = this.context!.createGain();
        bus.gain.value = BUS_GAIN[name];
        bus.connect(this.master!);
        this.buses.set(name, bus);
      });
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  setMasterVolume(value: number): void {
    this.unlock();
    if (this.master && Number.isFinite(value)) this.master.gain.value = Math.min(1, Math.max(0, value));
  }

  async playAmbient(url: string, volume = 0.32): Promise<void> {
    this.unlock();
    if (!this.context || this.ambientUrl === url) return;
    this.stopAmbient();
    const response = await fetch(url);
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (!this.context) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = Math.min(1, Math.max(0, volume));
    source.connect(gain).connect(this.buses.get("ambient") ?? this.master!);
    source.start();
    this.ambientSource = source;
    this.ambientUrl = url;
  }

  stopAmbient(): void {
    if (this.ambientSource) {
      try { this.ambientSource.stop(); } catch { /* already stopped */ }
      this.ambientSource.disconnect();
    }
    this.ambientSource = null;
    this.ambientUrl = null;
  }

  cueLegacy(kind: LegacyCue): void { this.emit({ cue: LEGACY_CUES[kind], category: busFor(LEGACY_CUES[kind]) as AudioEvent["category"], ...(kind === "combat" ? { monsterClass: "legacy" } : {}) } as AudioEvent); }

  /** Backward-compatible entry point for the existing Home event bridge. */
  cue(kind: LegacyCue): void { this.cueLegacy(kind); }

  emit(event: AudioEvent): void {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    const dedupeKey = `${event.cue}:${event.category}`;
    if ((this.recent.get(dedupeKey) ?? -Infinity) > now - (event.category === "movement" ? 0.08 : 0.025)) return;
    this.recent.set(dedupeKey, now);
    const externalUrl = this.assetUrls[event.cue];
    if (externalUrl) { void this.playOneShot(externalUrl, busFor(event.cue)); return; }
    const spec = CUES[event.cue];
    if (!spec) return;
    const bus = this.buses.get(busFor(event.cue)) ?? this.master;
    if (!bus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.frequency, now);
    if (spec.slide) oscillator.frequency.exponentialRampToValueAtTime(spec.slide, now + spec.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain, now + Math.min(0.018, spec.duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(now);
    oscillator.stop(now + spec.duration + 0.025);
    if (spec.noise) this.addNoise(now, spec.duration, bus);
  }

  private async playOneShot(url: string, bus: BusName): Promise<void> {
    if (!this.context) return;
    try {
      const response = await fetch(url);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.buses.get(bus) ?? this.master!);
      source.start();
    } catch { /* optional asset failure must never break gameplay */ }
  }

  private addNoise(start: number, duration: number, bus: AudioNode): void {
    if (!this.context) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.sin(index * 12.9898) * 43758.5453 % 1) * 2 - 1;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain).connect(bus);
    source.start(start);
  }

  footstep(surface: AudioSurface): void {
    this.emit({ cue: `movement.footstep.${surface}`, category: "movement", surface });
  }

  dispose(): void {
    this.stopAmbient();
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.master = null;
    this.buses.clear();
    this.recent.clear();
  }
}
