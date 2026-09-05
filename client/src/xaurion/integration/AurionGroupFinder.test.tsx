import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_RULESET, groupDungeonIds } from "@shared/groupInstanceProtocol";
import { AurionGroupFinder } from "./AurionGroupFinder";

const fixture = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  mutation: { isPending: false, mutateAsync: vi.fn() },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { groups: { read: { useQuery: () => fixture.query }, command: { useMutation: () => fixture.mutation } } } }));
function idleFixture() {
  return {
    ruleset: GROUP_RULESET, sourceRevision: "a".repeat(40),
    player: { userId: 7, revision: 3, skills: [], status: "idle", queueKey: null, ordinal: 0, role: null, qualificationHash: null, leaseUntilMs: 0, partyId: null, ready: false },
    qualification: { hash: "b".repeat(64), roles: ["dps"], weaponTrack: "spear" },
    catalog: groupDungeonIds.map(id => ({ id, label: id })),
    party: null, ticket: null, readyUserIds: [], enteredUserIds: [],
  };
}
beforeEach(() => {
  fixture.query.data = idleFixture(); fixture.query.isError = false;
  fixture.query.refetch.mockReset().mockResolvedValue({}); fixture.mutation.mutateAsync.mockReset().mockResolvedValue({});
});
describe("AIM-259 confirmed group UI", () => {
  it("never enables healing qualification from a weapon alone and sends only the equip intent", async () => {
    render(<AurionGroupFinder open />);
    expect((screen.getByRole("radio", { name: /Heiler/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Heilendes Licht/));
    await waitFor(() => expect(fixture.mutation.mutateAsync).toHaveBeenCalledWith({ expectedRevision: 3, action: { kind: "equip", skills: ["mending_light"] } }));
    expect((screen.getByRole("radio", { name: /Heiler/ }) as HTMLInputElement).disabled).toBe(true);
  });
  it("suppresses duplicate clicks, performs a readback after a lost response and never invents a party", async () => {
    let reject!: (error: Error) => void;
    fixture.mutation.mutateAsync.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<AurionGroupFinder open />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe suchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Gruppe suchen" }));
    expect(fixture.mutation.mutateAsync).toHaveBeenCalledTimes(1);
    reject(new Error("response lost"));
    await waitFor(() => expect(fixture.query.refetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Die Aktion ist nicht bestätigt/)).toBeTruthy();
    expect(screen.queryByText("Gruppe gefunden")).toBeNull();
  });
  it("withholds cached controls for an unavailable, foreign or malformed response", () => {
    const { rerender } = render(<AurionGroupFinder open />);
    for (const value of [
      { ...idleFixture(), player: { ...idleFixture().player, userId: 8 } },
      { ...idleFixture(), enteredUserIds: [7] },
    ]) {
      fixture.query.data = value; rerender(<AurionGroupFinder open />);
      expect(screen.getByRole("alert").textContent).toContain("nicht bestätigt");
      expect(screen.queryByRole("button", { name: "Gruppe suchen" })).toBeNull();
    }
    fixture.query.data = idleFixture(); fixture.query.isError = true; rerender(<AurionGroupFinder open />);
    expect(screen.queryByRole("button", { name: "Gruppe suchen" })).toBeNull();
  });
});
