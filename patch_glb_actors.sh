sed -i 's/getByRole("button", { name: "Aufträge", exact: true })/getByTestId("gamehud-quests-button")/' e2e/aim253.glbActors.spec.ts

# Also fix the iteration over buttons where it does it dynamically
sed -i 's/for (const name of \["Inventar", "Charakter", "Aufträge"\]) {/for (const testId of ["gamehud-inventory-button", "gamehud-character-button", "gamehud-quests-button"]) {/' e2e/aim253.glbActors.spec.ts
sed -i 's/await hud.getByRole("button", { name, exact: true }).click();/await hud.getByTestId(testId).click();/' e2e/aim253.glbActors.spec.ts
