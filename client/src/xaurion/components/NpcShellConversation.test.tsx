import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { NpcShellTarget } from "../integration/NpcShellProjection";
import { NpcShellConversation } from "./NpcShellConversation";

vi.mock("../audio/SoundSynthesizer", () => ({ soundSynth: { playUiOpen: vi.fn(), playUiClose: vi.fn(), playUiClick: vi.fn() } }));

const base: NpcShellTarget = { shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", designKey: "npc.shells.1a2b3c4d", placementKey: "p.000000000001",
  assetId: "glb_ranger", displayName: "Figur", position: { x: 2, y: 0, z: 1 } };
const confirmed: NpcShellTarget = { ...base, purpose: { purposeHash: "f".repeat(64), displayName: "Mira Kräuterhand", role: "Kräuterhändlerin", greeting: "Willkommen, Wanderer.",
  topics: [{ topic: "Kräuter", line: "Silberblatt wächst im Nebel." }, { topic: "Dorf", line: "Der Schmied vergisst kein Gesicht." }] } };
function engine(shell: NpcShellTarget, player = new THREE.Vector3(1, 0, 1)) {
  const scene = new THREE.Scene(); const holder = new THREE.Group(); holder.userData.npcShell = shell; scene.add(holder);
  return { scene, player: { position: player } };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

// Players talk to an NPC exactly as the admin confirmed it; no LLM at runtime.
describe("talking to a confirmed NPC", () => {
  it("offers the conversation near a confirmed NPC and shows its confirmed greeting and topics", () => {
    render(<NpcShellConversation engineRef={{ current: engine(confirmed) as never }} />);
    fireEvent.click(screen.getByTestId("npc-shell-talk-prompt"));
    expect(screen.getByTestId("npc-shell-line").textContent).toBe("„Willkommen, Wanderer.“");
    fireEvent.click(screen.getByRole("button", { name: "Dorf" }));
    expect(screen.getByTestId("npc-shell-line").textContent).toBe("„Der Schmied vergisst kein Gesicht.“");
    fireEvent.click(screen.getByRole("button", { name: "Gespräch beenden" }));
    expect(screen.queryByTestId("npc-shell-conversation")).toBeNull();
  });

  it("has nothing to say for a shell without a confirmed purpose or when far away", () => {
    const first = render(<NpcShellConversation engineRef={{ current: engine(base) as never }} />);
    expect(screen.queryByTestId("npc-shell-talk-prompt")).toBeNull();
    first.unmount();
    render(<NpcShellConversation engineRef={{ current: engine(confirmed, new THREE.Vector3(40, 0, 40)) as never }} />);
    expect(screen.queryByTestId("npc-shell-talk-prompt")).toBeNull();
  });

  it("ends the conversation when the player walks away", async () => {
    const world = engine(confirmed);
    render(<NpcShellConversation engineRef={{ current: world as never }} />);
    fireEvent.click(screen.getByTestId("npc-shell-talk-prompt"));
    world.player.position.set(40, 0, 40);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.queryByTestId("npc-shell-conversation")).toBeNull();
  });

  // Review (Devin, #1329): a nearer unconfirmed shell hid the conversation with a confirmed NPC.
  it("offers the nearest confirmed NPC even when an unconfirmed shell stands closer", () => {
    const scene = new THREE.Scene();
    const near = new THREE.Group(); near.userData.npcShell = { ...base, shellRef: "authored:npc.shells.1a2b3c4d:p.000000000009", position: { x: 1.2, y: 0, z: 1 } }; scene.add(near);
    const talker = new THREE.Group(); talker.userData.npcShell = confirmed; scene.add(talker);
    render(<NpcShellConversation engineRef={{ current: { scene, player: { position: new THREE.Vector3(1, 0, 1) } } as never }} />);
    expect(screen.getByTestId("npc-shell-talk-prompt").textContent).toContain("Mira Kräuterhand");
  });
});
