/**
 * Aurion Soundscape
 * Sound is derived from confirmed local gameplay events; no external audio service
 * or player-controlled payload can trigger arbitrary synthesis parameters.
 */
type Cue = "system" | "command" | "combat" | "connection" | "warning";

export class AurionSoundscape {
  private context: AudioContext | null = null;

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }

  dispose(): void {
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
  }

  cue(kind: Cue): void {
    this.unlock();
    const context = this.context;
    if (!context) return;
    const palette: Record<Cue, { frequency: number; duration: number; type: OscillatorType; gain: number }> = {
      system: { frequency: 392, duration: 0.12, type: "sine", gain: 0.045 },
      command: { frequency: 523.25, duration: 0.07, type: "triangle", gain: 0.038 },
      combat: { frequency: 146.83, duration: 0.16, type: "sawtooth", gain: 0.05 },
      connection: { frequency: 659.25, duration: 0.19, type: "sine", gain: 0.05 },
      warning: { frequency: 196, duration: 0.12, type: "square", gain: 0.035 },
    };
    const tone = palette[kind];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, context.currentTime);
    if (kind === "combat") oscillator.frequency.exponentialRampToValueAtTime(74, context.currentTime + tone.duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(tone.gain, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + tone.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + tone.duration + 0.02);
  }
}
