import { ZONE_POSITION_LIMIT, ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { AX1_BLADE_SKILL_SOURCE_REVISION } from "@shared/ax1BladeSkillProtocol";
import { ZONE_COMBAT_CONTRACT_VERSION } from "@shared/zoneCombatContract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoneMovementClient, zoneWebSocketUrl } from "./zoneMovement";

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

const emptyAuthority = { mobs: [] as const, combatants: [] as const };
const welcome = { type: "welcome" as const, protocolVersion: ZONE_PROTOCOL_VERSION, connectionId: "zone_peer_fixture", selfEntityId: "player:1", zoneId: "observatory_threshold" as const, snapshotSeq: 0, tick: 0, presences: [], ...emptyAuthority };

describe("zone movement browser transport", () => {
  afterEach(() => { vi.unstubAllGlobals(); TestSocket.instances = []; });
  it("derives a secure production WSS endpoint without exposing a ticket in the URL", () => {
    expect(zoneWebSocketUrl("https://arelogic.space")).toBe("wss://arelogic.space/v1/ws");
    expect(zoneWebSocketUrl("http://localhost:3000")).toBe("ws://localhost:3000/v1/ws");
  });

  it("closes connecting sockets and ignores every event from an old connection", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options);
    client.connect("fixture-ticket-one");
    const old = TestSocket.instances[0];
    client.connect("fixture-ticket-two");
    expect(old.close).toHaveBeenCalled();
    options.onStatus.mockClear();
    old.dispatchEvent(new Event("open"));
    old.dispatchEvent(new Event("close"));
    old.dispatchEvent(new Event("error"));
    old.receive({ type: "reject", code: "EXPIRED_TICKET" });
    expect(old.send).not.toHaveBeenCalled();
    expect(options.onStatus).not.toHaveBeenCalled();
    expect(options.onReject).not.toHaveBeenCalled();
    client.close();
  });

  it("projects only structurally valid integer v4 snapshots", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options);
    client.connect("fixture-ticket");
    const socket = TestSocket.instances[0];
    const snapshot = { type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 1, tick: 10, presences: [{ entityId: "player:1", userId: 1, position: { x: 1000, z: -2000 }, lastAcceptedClientSeq: 0 }], ...emptyAuthority };
    socket.receive({ ...snapshot, type: "welcome", protocolVersion: ZONE_PROTOCOL_VERSION, connectionId: "zone_peer_fixture", selfEntityId: "player:1", snapshotSeq: 0 });
    options.onSnapshot.mockClear();
    for (const invalid of [null, {}, { ...snapshot, tick: -1 }, { ...snapshot, presences: [{}] }, { ...snapshot, presences: [{ ...snapshot.presences[0], position: { x: 0.5, z: 0 } }] }, { ...snapshot, mobs: null }, { ...snapshot, combatants: null }]) socket.receive(invalid);
    expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive(snapshot);
    expect(options.onSnapshot).toHaveBeenCalledTimes(1);
    expect(options.onSnapshot).toHaveBeenCalledWith(snapshot);
    client.close();
  });
  it("negotiates v4 and explicitly rejects a legacy server welcome", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options={onStatus:vi.fn(),onSnapshot:vi.fn(),onReject:vi.fn()};
    const client=new ZoneMovementClient(options);client.connect("fixture-ticket");
    const socket=TestSocket.instances[0];socket.dispatchEvent(new Event("open"));
    expect(JSON.parse(socket.send.mock.calls[0][0]).protocolVersion).toBe(ZONE_PROTOCOL_VERSION);
    socket.receive({type:"welcome",protocolVersion:ZONE_PROTOCOL_VERSION-1,connectionId:"zone_peer_fixture",zoneId:"observatory_threshold",snapshotSeq:1,tick:0,presences:[],...emptyAuthority});
    expect(options.onSnapshot).not.toHaveBeenCalled();
    expect(options.onReject).toHaveBeenCalledWith("PROTOCOL_VERSION_UNSUPPORTED");
    socket.dispatchEvent(new CloseEvent("close",{code:1008}));
    expect(options.onStatus).toHaveBeenLastCalledWith("rejected");
  });

  it("rejects out-of-order, duplicate, oversized and identity-inconsistent snapshots", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options); client.connect("fixture-ticket");
    const socket = TestSocket.instances[0];
    const snapshot = { type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 10, tick: 10, presences: [{ entityId: "player:1", userId: 1, position: { x: 1000, z: 0 }, lastAcceptedClientSeq: 0 }], ...emptyAuthority };
    socket.receive(snapshot); expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive({ ...snapshot, type: "welcome", protocolVersion: ZONE_PROTOCOL_VERSION, connectionId: "zone_peer_fixture", selfEntityId: "player:1" });
    options.onSnapshot.mockClear();
    for (const invalid of [snapshot, { ...snapshot, snapshotSeq: 9 }, { ...snapshot, snapshotSeq: 11, tick: 9 }, { ...snapshot, snapshotSeq: 11, presences: [...snapshot.presences, ...snapshot.presences] }, { ...snapshot, snapshotSeq: 11, presences: [{ ...snapshot.presences[0], entityId: "player:2" }] }, { ...snapshot, snapshotSeq: 11, presences: [{ ...snapshot.presences[0], position: { x: ZONE_POSITION_LIMIT + 1, z: 0 } }] }, { ...snapshot, snapshotSeq: 11, presences: new Array(129).fill(snapshot.presences[0]) }, { ...snapshot, snapshotSeq: 11, extra: "x".repeat(65537) }]) socket.receive(invalid);
    expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive({ ...snapshot, snapshotSeq: 11, tick: 11 }); expect(options.onSnapshot).toHaveBeenCalledTimes(1);
    client.close();
  });

  it("sends k_strike as a dedicated authenticated skill command after the zone welcome", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options); client.connect("fixture-ticket");
    const socket = TestSocket.instances[0]; socket.readyState = TestSocket.OPEN; socket.dispatchEvent(new Event("open")); socket.receive(welcome);
    expect(client.sendSkill("k_strike", "mob_12")).toBe(true);
    expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toEqual({ type: "skill", clientSeq: 1, skillId: "k_strike", targetEntityId: "mob_12" });
    expect(client.sendSkill("k_strike", "not-a-mob")).toBe(false);
    client.close();
  });

  it("accepts only combat-v2 events with the exact AX1 skill provenance", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn(), onCombat: vi.fn() };
    const client = new ZoneMovementClient(options); client.connect("fixture-ticket");
    const socket = TestSocket.instances[0]; socket.readyState = TestSocket.OPEN; socket.dispatchEvent(new Event("open")); socket.receive(welcome);
    const event = { type: "combat", contractVersion: ZONE_COMBAT_CONTRACT_VERSION, tick: 1, sequence: 1, action: "melee", skillId: "k_strike", skillSourceRevision: AX1_BLADE_SKILL_SOURCE_REVISION, attackerEntityId: "player:1", defenderEntityId: "mob_12", hit: true, damage: 11, crit: false, killed: false, defenderHealth: 89, attackerStamina: 92, gameplaySourceRevision: "a".repeat(40) };
    socket.receive(event);
    expect(options.onCombat).toHaveBeenCalledTimes(1);
    expect(options.onCombat).toHaveBeenCalledWith(event);
    socket.receive({ ...event, sequence: 2, skillSourceRevision: "b".repeat(40) });
    expect(options.onCombat).toHaveBeenCalledTimes(1);
    client.close();
  });
});
