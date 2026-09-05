import { afterEach, describe, expect, it, vi } from "vitest";
import { Scene, Vector3 } from "three";
import { DeterministicSimulation } from "@shared/deterministicSimulation";
import { OpenWorldPlayer } from "../entities/OpenWorldPlayer";
import { ConfirmedPlayerMotion } from "./ConfirmedPlayerMotion";

describe("confirmed player projection", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps the actual procedural actor at the server position during held input, collision and disconnect", () => {
    // jsdom has no canvas; only the decorative texture drawing is stubbed.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),fillText:vi.fn(),arc:vi.fn(),fill:vi.fn(),createLinearGradient:()=>({addColorStop:vi.fn()})} as unknown as CanvasRenderingContext2D);
    const player = new OpenWorldPlayer(new Scene(), "knight", new DeterministicSimulation("motion-proof", 0));
    const speed = vi.spyOn(player, "setConfirmedGlbSpeed");
    const motion = new ConfirmedPlayerMotion(player, () => 2);
    motion.project({ x: 0, z: -56100 }, 1);
    motion.project({ x: -21760, z: -56100 }, 65);
    motion.project({ x: -21760, z: -56100 }, 66);
    for (let frame = 0; frame < 120; frame++) {
      player.update(1 / 60, { x: -1, z: 0 });
      expect(player.position).toEqual(new Vector3(-21.76, 2, -56.1));
      expect(player.group.position).toEqual(player.position);
    }
    expect(speed).toHaveBeenLastCalledWith(0);
    motion.project({x:-21420,z:-56100},67);
    expect(speed.mock.calls.at(-1)![0]).toBeCloseTo(3.4);
    motion.stop();player.update(1/60,{x:1,z:0});
    expect(player.position.x).toBe(-21.42);
    expect(speed).toHaveBeenLastCalledWith(0);
  });
});
