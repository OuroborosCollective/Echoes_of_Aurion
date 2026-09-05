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

  it("projects only structurally valid integer snapshots", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options);
    client.connect("fixture-ticket");
    const socket = TestSocket.instances[0];
    const snapshot = { type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 1, tick: 10, presences: [{ entityId: "player:1", userId: 1, position: { x: 1000, z: -2000 }, lastAcceptedClientSeq: 0 }] };
    socket.receive({ ...snapshot, type: "welcome", connectionId: "zone_peer_fixture", snapshotSeq: 0 });
    options.onSnapshot.mockClear();
    for (const invalid of [null, {}, { ...snapshot, tick: -1 }, { ...snapshot, presences: [{}] }, { ...snapshot, presences: [{ ...snapshot.presences[0], position: { x: 0.5, z: 0 } }] }]) socket.receive(invalid);
    expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive(snapshot);
    expect(options.onSnapshot).toHaveBeenCalledTimes(1);
    expect(options.onSnapshot).toHaveBeenCalledWith(snapshot);
    client.close();
  });

  it("rejects out-of-order, duplicate, oversized and identity-inconsistent snapshots", () => {
    vi.stubGlobal("WebSocket", TestSocket);
    const options = { onStatus: vi.fn(), onSnapshot: vi.fn(), onReject: vi.fn() };
    const client = new ZoneMovementClient(options); client.connect("fixture-ticket");
    const socket = TestSocket.instances[0];
    const snapshot = { type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 10, tick: 10, presences: [{ entityId: "player:1", userId: 1, position: { x: 1000, z: 0 }, lastAcceptedClientSeq: 0 }] };
    socket.receive(snapshot); expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive({ ...snapshot, type: "welcome", connectionId: "zone_peer_fixture" });
    options.onSnapshot.mockClear();
    for (const invalid of [snapshot, { ...snapshot, snapshotSeq: 9 }, { ...snapshot, snapshotSeq: 11, tick: 9 }, { ...snapshot, snapshotSeq: 11, presences: [...snapshot.presences, ...snapshot.presences] }, { ...snapshot, snapshotSeq: 11, presences: [{ ...snapshot.presences[0], entityId: "player:2" }] }, { ...snapshot, snapshotSeq: 11, presences: [{ ...snapshot.presences[0], position: { x: 14501, z: 0 } }] }, { ...snapshot, snapshotSeq: 11, presences: new Array(129).fill(snapshot.presences[0]) }, { ...snapshot, snapshotSeq: 11, extra: "x".repeat(65537) }]) socket.receive(invalid);
    expect(options.onSnapshot).not.toHaveBeenCalled();
    socket.receive({ ...snapshot, snapshotSeq: 11, tick: 11 }); expect(options.onSnapshot).toHaveBeenCalledTimes(1);
    client.close();
  });
});
