import { useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import type { PlayerUiReadback } from "@shared/playerUiProtocol";

type Readback = inferRouterOutputs<AppRouter>["crafting"]["manipulationRead"];
type Command = inferRouterInputs<AppRouter>["crafting"]["manipulate"];
const labels: Record<string, string> = { craft: "Klinge herstellen", reforge: "Affixe neu schmieden", augment: "Affix ergänzen", upgrade: "Stufe erhöhen", socket: "Sockel hinzufügen", shaping: "Zum Speer formen", salvage: "Material zurückgewinnen", repair: "Reparieren" };
export function ItemManipulationPanel({ readback, inventory, pending, onManipulate }: {
  readback?: Readback; inventory?: PlayerUiReadback; pending: boolean; onManipulate: (command: Command) => void;
}) {
  const [recipeId, setRecipeId] = useState("aurion-craft-v2");
  const [sourceId, setSourceId] = useState("");
  if (!readback) return <p role="status">Werkbank wird geladen.</p>;
  const recipe = readback.recipes.find(recipe => recipe.id === recipeId);
  if (!recipe) return null;
  const items = inventory?.items.filter(item => item.version === "aurion_v2" && item.status === "owned") ?? [];
  const sources = items.filter(item => item.slot !== null && (recipe.operation !== "shaping" || item.definition.startsWith("weapon-")));
  const source = sources.find(item => item.id === sourceId) ?? sources[0];
  const requirements = Object.entries(recipe.materialRequirements);
  const materials = items.filter(item => requirements.some(([id]) => id === item.definition));
  const enough = requirements.every(([id, required]) => materials.filter(item => item.definition === id).reduce((sum, item) => sum + BigInt(item.quantityExact ?? "1"), 0n) >= BigInt(required));
  const ready = !pending && enough && (recipe.operation === "craft" || Boolean(source));
  return <section aria-label="Item-Werkbank" className="p-4 border border-cyan-700 rounded-xl space-y-3">
    <h4 className="font-serif text-cyan-300">Item-Werkbank</h4>
    <label className="block">Bearbeitung<select aria-label="Item-Bearbeitung" value={recipeId} disabled={pending} onChange={event => setRecipeId(event.target.value)} className="block w-full">{readback.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{labels[recipe.operation]}</option>)}</select></label>
    {recipe.operation !== "craft" && <label className="block">Gegenstand<select aria-label="Werkbank-Gegenstand" value={source?.id ?? ""} disabled={pending} onChange={event => setSourceId(event.target.value)} className="block w-full">{!sources.length && <option value="">Kein geeigneter Gegenstand</option>}{sources.map(item => <option key={item.id} value={item.id}>{item.name} · Stufe {item.levelExact}</option>)}</select></label>}
    <p className="text-xs">{requirements.length ? requirements.map(([id, quantity]) => `${quantity} × ${id.includes("echo-clay") ? "Echoton" : "Sterneisen"}`).join(", ") : "Gewinnt 1 Sterneisen zurück."}</p>
    {recipe.operation !== "craft" && <p className="text-xs text-gray-400">Der gewählte Gegenstand wird durch das bestätigte Ergebnis ersetzt. Lege ausgerüstete Gegenstände vorher ab.</p>}
    {!enough && <p role="status">Es fehlen Materialien.</p>}
    <button className="ax1-primary" disabled={!ready} onClick={() => onManipulate({ recipeId, sourceItemId: recipe.operation === "craft" ? undefined : source?.id,
      materialItemIds: materials.map(item => item.id).sort(), expectedRevisionExact: readback.inventory.revisionExact,
      expectedStateHash: readback.inventory.stateHash, idempotencyKey: `ui:${readback.inventory.stateHash.slice(7,39)}:${recipeId}:${source?.id.slice(-12) ?? "craft"}` })}>{pending ? "Wird bestätigt …" : labels[recipe.operation]}</button>
  </section>;
}
