import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AurionAuthoringWorkbench from "./AurionAuthoringWorkbench";

// Explicit UI-only testdouble: delayed proposals are not model/runtime evidence.
const fixture = vi.hoisted(() => ({ propose: vi.fn() }));
vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) };
  return { trpc: {
    useUtils: () => ({}),
    aurionAuthoring: {
      catalog: { useQuery: () => ({ data: { glbCatalogRevision: "a".repeat(64), assets: [], world: { designs: [] }, dungeons: [] } }) },
      propose: { useMutation: () => ({ mutateAsync: fixture.propose, isPending: false, error: null }) },
      worldPlan: mutation, worldApply: mutation, dungeonPlan: mutation, dungeonApply: mutation,
    },
    aurionQuest: { proposeDraft: mutation, publishPlan: mutation, publish: mutation },
  } };
});

beforeEach(() => vi.clearAllMocks());

function start() {
  let resolve!: (value: { draftJson: string; title: string }) => void;
  let reject!: (error: Error) => void;
  fixture.propose.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
  render(<AurionAuthoringWorkbench />);
  fireEvent.change(screen.getByPlaceholderText(/Baue in Windhain/), { target: { value: "Create a small market proposal" } });
  fireEvent.click(screen.getByRole("button", { name: /KI-Draft erzeugen/ }));
  expect(fixture.propose).toHaveBeenCalledOnce();
  return { resolve, reject };
}

function tab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}
const output = { draftJson: '{"title":"Delayed world"}', title: "Delayed world" };

it("discards a response after leaving and returning to the same tab", async () => {
  const pending = start();
  tab("Nebenquest"); tab("Welt");
  await act(async () => pending.resolve(output));
  expect((screen.getByPlaceholderText(/Hier erscheint/) as HTMLTextAreaElement).value).toBe("");
  expect(screen.queryByText(/KI-Vorschlag.*Delayed world/)).toBeNull();
});

it("preserves a draft edited while a model response is pending", async () => {
  const pending = start();
  fireEvent.change(screen.getByPlaceholderText(/Hier erscheint/), { target: { value: '{"title":"Manual edit"}' } });
  await act(async () => pending.resolve(output));
  expect((screen.getByPlaceholderText(/Hier erscheint/) as HTMLTextAreaElement).value).toContain("Manual edit");
});

it("ignores a proposal error after switching authoring kind", async () => {
  const pending = start(); tab("Dungeon");
  await act(async () => pending.reject(new Error("DELAYED_PROVIDER_ERROR")));
  expect(screen.queryByText(/DELAYED_PROVIDER_ERROR/)).toBeNull();
});

it("accepts a response in the unchanged authoring scope", async () => {
  const pending = start();
  await act(async () => pending.resolve(output));
  expect((screen.getByPlaceholderText(/Hier erscheint/) as HTMLTextAreaElement).value).toBe(output.draftJson);
  expect(screen.getByText(/KI-Vorschlag.*Delayed world/)).toBeTruthy();
});
