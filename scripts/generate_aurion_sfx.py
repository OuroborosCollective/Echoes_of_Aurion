#!/usr/bin/env python3
"""Render original deterministic Aurion presentation-only SFX as PCM WAV."""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 44_100
OUT = Path(__file__).resolve().parents[1] / "public" / "audio" / "sfx"


def envelope(t: float, duration: float, attack: float = 0.008, release: float = 0.08) -> float:
    if t < 0 or t > duration:
        return 0.0
    if t < attack:
        return t / attack
    if t > duration - release:
        return max(0.0, (duration - t) / release)
    return 1.0


def noise(index: int, seed: int) -> float:
    value = (index * 1_103_515_245 + seed * 12_345 + 12_345) & 0x7FFFFFFF
    return (value / 1_073_741_824.0) - 1.0


def tone(t: float, frequency: float, phase: float = 0.0) -> float:
    return math.sin(2.0 * math.pi * frequency * t + phase)


def sweep(t: float, start: float, end: float, duration: float) -> float:
    ratio = end / start
    phase = 2.0 * math.pi * start * duration * ((ratio ** (min(max(t, 0.0), duration) / duration)) - 1.0) / math.log(ratio)
    return math.sin(phase)


def add(samples: list[float], start: float, duration: float, fn) -> None:
    first = max(0, int(start * RATE))
    last = min(len(samples), int((start + duration) * RATE) + 1)
    for index in range(first, last):
        t = index / RATE - start
        samples[index] += fn(t, index, duration)


def make(duration: float, renderer) -> list[float]:
    samples = [0.0] * int(duration * RATE)
    renderer(samples)
    return [math.tanh(sample * 1.4) * 0.72 for sample in samples]


def strike_sharp() -> list[float]:
    return make(0.22, lambda s: (
        add(s, 0.0, 0.16, lambda t, i, d: 0.55 * sweep(t, 1600, 280, d) * envelope(t, d, 0.003, 0.11)),
        add(s, 0.0, 0.08, lambda t, i, d: 0.22 * noise(i, 11) * envelope(t, d, 0.002, 0.06))
    ))


def strike_pointed() -> list[float]:
    return make(0.24, lambda s: (
        add(s, 0.0, 0.12, lambda t, i, d: 0.48 * sweep(t, 1080, 130, d) * envelope(t, d, 0.002, 0.085)),
        add(s, 0.025, 0.045, lambda t, i, d: 0.18 * noise(i, 23) * envelope(t, d, 0.001, 0.035))
    ))


def strike_blunt() -> list[float]:
    return make(0.32, lambda s: (
        add(s, 0.0, 0.22, lambda t, i, d: 0.78 * sweep(t, 132, 48, d) * envelope(t, d, 0.004, 0.16)),
        add(s, 0.0, 0.12, lambda t, i, d: 0.15 * noise(i, 37) * envelope(t, d, 0.002, 0.08))
    ))


def heal() -> list[float]:
    return make(0.74, lambda s: [
        add(s, start, 0.38, lambda t, i, d, f=f: 0.23 * tone(t, f) * envelope(t, d, 0.025, 0.15))
        for start, f in ((0.0, 523.25), (0.12, 659.25), (0.24, 783.99))
    ])


def buff() -> list[float]:
    return make(0.65, lambda s: [
        add(s, start, 0.34, lambda t, i, d, f=f: 0.22 * tone(t, f) * envelope(t, d, 0.02, 0.12))
        for start, f in ((0.0, 293.66), (0.10, 369.99), (0.20, 440.0), (0.30, 587.33))
    ])


def creature_attack(creature: str) -> list[float]:
    specs = {"wolf": (0.46, 230, 92, 0.38, 61), "human": (0.30, 220, 114, 0.26, 73), "monster": (0.58, 138, 36, 0.54, 89)}
    duration, high, low, level, seed = specs[creature]
    return make(duration, lambda s: (
        add(s, 0.0, duration * 0.9, lambda t, i, d: level * sweep(t, high, low, d) * envelope(t, d, 0.006, d * 0.36)),
        add(s, 0.01, duration * 0.75, lambda t, i, d: level * 0.42 * noise(i, seed) * envelope(t, d, 0.003, d * 0.42))
    ))


def creature_death(creature: str) -> list[float]:
    specs = {"wolf": (0.66, 320, 56, 0.36, 103), "human": (0.58, 260, 52, 0.30, 127), "monster": (0.92, 180, 24, 0.52, 149)}
    duration, high, low, level, seed = specs[creature]
    return make(duration, lambda s: (
        add(s, 0.0, duration * 0.92, lambda t, i, d: level * sweep(t, high, low, d) * envelope(t, d, 0.015, d * 0.32)),
        add(s, duration * 0.38, duration * 0.5, lambda t, i, d: level * 0.38 * noise(i, seed) * envelope(t, d, 0.004, d * 0.55))
    ))


def run_surface(surface: str) -> list[float]:
    specs = {"earth": (94, 0.45, 173), "grass": (150, 0.28, 191), "stone": (720, 0.33, 211), "wood": (128, 0.38, 229), "water": (260, 0.31, 251)}
    frequency, level, seed = specs[surface]
    def render(samples: list[float]) -> None:
        for start in (0.0, 0.16, 0.32):
            add(samples, start, 0.115, lambda t, i, d, f=frequency, a=level, n=seed: a * tone(t, f) * envelope(t, d, 0.003, 0.085))
            add(samples, start, 0.09, lambda t, i, d, a=level, n=seed: a * 0.58 * noise(i, n) * envelope(t, d, 0.002, 0.07))
    return make(0.52, render)


def screw_pouch() -> list[float]:
    notes = (1900, 1420, 2320, 1160, 2740, 980, 1880, 1510)
    return make(0.62, lambda s: [
        add(s, index * 0.055, 0.19, lambda t, i, d, f=f: 0.17 * tone(t, f) * envelope(t, d, 0.001, 0.17))
        for index, f in enumerate(notes)
    ])


def harvest_plant() -> list[float]:
    return make(0.45, lambda s: (
        add(s, 0.0, 0.36, lambda t, i, d: 0.32 * noise(i, 271) * envelope(t, d, 0.012, 0.22)),
        add(s, 0.12, 0.2, lambda t, i, d: 0.16 * sweep(t, 560, 230, d) * envelope(t, d, 0.01, 0.12))
    ))


def harvest_wood() -> list[float]:
    return make(0.52, lambda s: [
        add(s, start, 0.17, lambda t, i, d: 0.66 * sweep(t, 148, 62, d) * envelope(t, d, 0.003, 0.13))
        for start in (0.0, 0.24)
    ])


def mine_ore() -> list[float]:
    return make(0.55, lambda s: [
        add(s, start, 0.26, lambda t, i, d, f=f: 0.38 * tone(t, f) * envelope(t, d, 0.002, 0.22))
        for start, f in ((0.0, 1680), (0.025, 980), (0.29, 1420), (0.315, 760))
    ])


def saw_workbench() -> list[float]:
    def render(samples: list[float]) -> None:
        for tick in range(10):
            start = tick * 0.055
            add(samples, start, 0.045, lambda t, i, d: 0.18 * (2 * ((t * 210) % 1) - 1) * envelope(t, d, 0.002, 0.025))
            add(samples, start, 0.04, lambda t, i, d: 0.12 * noise(i, 307 + tick) * envelope(t, d, 0.001, 0.03))
    return make(0.62, render)


def write(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    payload = b"".join(struct.pack("<h", max(-32767, min(32767, int(sample * 32767)))) for sample in samples)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(payload)


def main() -> None:
    renderers = {
        "combat-attack-sharp": strike_sharp, "combat-attack-pointed": strike_pointed, "combat-attack-blunt": strike_blunt,
        "combat-spell-heal": heal, "combat-spell-buff": buff,
        "combat-creature-wolf-attack": lambda: creature_attack("wolf"), "combat-creature-human-attack": lambda: creature_attack("human"), "combat-creature-monster-attack": lambda: creature_attack("monster"),
        "combat-creature-wolf-death": lambda: creature_death("wolf"), "combat-creature-human-death": lambda: creature_death("human"), "combat-creature-monster-death": lambda: creature_death("monster"),
        "movement-run-earth": lambda: run_surface("earth"), "movement-run-grass": lambda: run_surface("grass"), "movement-run-stone": lambda: run_surface("stone"), "movement-run-wood": lambda: run_surface("wood"), "movement-run-water": lambda: run_surface("water"),
        "interaction-loot-screw-pouch": screw_pouch, "resource-harvest-plant": harvest_plant, "resource-harvest-wood": harvest_wood,
        "resource-mine-ore": mine_ore, "crafting-workbench-saw": saw_workbench,
    }
    for name, renderer in renderers.items():
        write(name, renderer())
    print(f"rendered {len(renderers)} deterministic original SFX to {OUT}")


if __name__ == "__main__":
    main()
