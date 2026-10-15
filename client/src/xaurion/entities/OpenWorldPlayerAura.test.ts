import { afterEach, describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Scene } from "three";
import { DeterministicSimulation } from "@shared/deterministicSimulation";
import { OpenWorldPlayer } from "./OpenWorldPlayer";

describe("OpenWorldPlayer equipment aura", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a repeated equipment aura visible for the full lifetime of the latest change", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    } as unknown as CanvasRenderingContext2D);

    const player = new OpenWorldPlayer(
      new Scene(),
      "knight",
      new DeterministicSimulation("equipment-aura-proof", 0),
    );
    const shield = (player as unknown as { shieldBubble: Mesh }).shieldBubble;
    const material = shield.material as MeshStandardMaterial;

    player.emitEquipmentAura();
    vi.advanceTimersByTime(200);
    player.emitEquipmentAura();
    vi.advanceTimersByTime(100);

    expect(material.opacity).toBe(0.45);

    vi.advanceTimersByTime(200);
    expect(material.opacity).toBe(0);

    player.disposePresentation();
  });
});
