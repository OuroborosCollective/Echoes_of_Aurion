import { ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { AX1_ECOLOGY_SOURCE_REVISION } from "@shared/ax1ResourceEcologyProtocol";
import { ZONE_RESOURCE_CONTRACT_VERSION } from "@shared/zoneResourceContract";
import {
  ZONE_TELEGRAPH_AUTHORITY_RULESET,
  ZONE_TELEGRAPH_CONTRACT_VERSION,
  ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION,
  type ConfirmedZoneTelegraphEvent,
} from "@shared/zoneTelegraphContract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneMovementClient } from "./zoneMovement";
import {
  ZONE_TELEGRAPH_READBACK_EVENT,
  ZONE_TICK_READBACK_EVENT,
  type ConfirmedZoneTickReadback,
} from "./zoneTelegraphReadback";

class TestSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = TestSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor(_url: string) { super(); TestSocket.instances.push(this); }
  receive(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
}

const resources = {
  contractVersion: ZONE_RESOURCE_CONTRACT_VERSION,
  contentSourceRevision: AX1_ECOLOGY_SOURCE_REVISION,
  revision: 1,
  nodes: [
    { nodeId: "node_beast_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_copper_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_cotton_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_iron_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_steel_1", remaining: 5, depleted: false, respawnAtTick: null },
  ],
} as const;

const welcome = {
  type: "welcome" as const,
  protocolVersion: ZONE_PROTOCOL_VERSION,
  connectionId: "zone_peer_fixture",
  selfEntityId: "player:1",
  zoneId: "observatory_threshold" as const,
  snapshotSeq: 0,
  tick: 0,
  presences: [],
  mobs: [],
  combatants: [],
  resources,
};

const telegraph: ConfirmedZoneTelegraphEvent = {
  type: "telegraph",
  contractVersion: ZONE_TELEGRAPH_CONTRACT_VERSION,
  id: "telegraph:mob_5:1",
  sequence: 1,
  startTick: 5,
  impactTick: 11,
  attackerEntityId: "mob_5",
  targetEntityId: "player:1",
  kind: "line",
  origin: { x: 1_000, z: 2_000 },
  target: { x: 4_000, z: 6_000 },
  widthFixed: 2_000,
  color: "#ef4444",
  visualSourceRevision: ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION,
  authorityRuleset: ZONE_TELEGRAPH_AUTHORITY_RULESET,
};

describe("zone telegraph browser transport", () => {
  afterEach(() => { vi.unstubAllGlobals(); TestSocket.instances = []; });

  it("fans out only validated source-bound telegraphs and confirmed ticks", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const telegraphs: ConfirmedZoneTelegraphEvent[] = [];
    const ticks: number[] = [];
    const onTelegraph = (event: Event) => telegraphs.push((event as CustomEvent<ConfirmedZoneTelegraphEvent>).detail);
    const onTick = (event: Event) => ticks.push((event as CustomEvent<ConfirmedZoneTickReadback>).detail.tick);
    window.addEventListener(ZONE_TELEGRAPH_READBACK_EVENT, onTelegraph);
    window.addEventListener(ZONE_TICK_READBACK_EVENT, onTick);
    const client = new ZoneMovementClient({ onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() });
    try {
      client.connect("fixture-ticket");
      const socket = TestSocket.instances[0];
      socket.receive(welcome);
      expect(ticks).toEqual([0]);

      socket.receive(telegraph);
      expect(telegraphs).toEqual([telegraph]);
      expect(ticks).toEqual([0, 5]);

      socket.receive({
        ...telegraph,
        id: "telegraph:mob_5:2",
        sequence: 2,
        visualSourceRevision: "0".repeat(40),
      });
      expect(telegraphs).toEqual([telegraph]);
      expect(ticks).toEqual([0, 5]);
    } finally {
      client.close();
      window.removeEventListener(ZONE_TELEGRAPH_READBACK_EVENT, onTelegraph);
      window.removeEventListener(ZONE_TICK_READBACK_EVENT, onTick);
    }
  });
});
