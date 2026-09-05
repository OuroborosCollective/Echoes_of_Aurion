import type { MMOEngine } from "../core/MMOEngine";

/** Animate confirmed motion while keeping AX1 kinematics from predicting past server collisions. */
export class ConfirmedPlayerMotion {
  private direction = { x: 0, z: 0 };
  private last?: { x: number; z: number; tick: number };
  constructor(private readonly player: MMOEngine["player"], private readonly elevation: (x: number, z: number) => number) {
    const update = player.update.bind(player);
    player.update = delta => {
      const { x, y, z } = player.position;
      // The imported update still drives gait, facing, equipment and attack effects.
      // Its standalone displacement is discarded before the camera or renderer runs.
      try { update(delta, this.direction); }
      finally {
        player.position.set(x, y, z);
        player.group.position.copy(player.position);
        player.velocity.set(0, 0, 0);
        Object.assign(player.stats, { x, y, z });
      }
    };
  }
  project(position: { x: number; z: number }, tick: number): void {
    const x = position.x / 1000, z = position.z / 1000;
    const seconds = this.last ? (tick - this.last.tick) / 10 : 0;
    this.direction = this.last && seconds > 0 ? { x: x - this.last.x, z: z - this.last.z } : { x: 0, z: 0 };
    this.player.setConfirmedGlbSpeed(seconds > 0 ? Math.hypot(this.direction.x, this.direction.z) / seconds : 0);
    this.last = { x, z, tick };
    this.player.position.set(x, this.elevation(x, z), z);
    this.player.group.position.copy(this.player.position);
    Object.assign(this.player.stats, { x, y: this.player.position.y, z });
  }
  stop(): void {
    this.last = undefined;
    this.direction = { x: 0, z: 0 };
    this.player.setConfirmedGlbSpeed(0);
  }
}
