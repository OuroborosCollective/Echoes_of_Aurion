sed -i 's/const name = testId === "gamehud-inventory-button" ? "Inventar" : testId === "gamehud-character-button" ? "Charakter" : "Aufträge";//' e2e/aim253.glbActors.spec.ts
sed -i '/await hud.getByTestId(testId).click();/i \        const name = testId === "gamehud-inventory-button" ? "Inventar" : testId === "gamehud-character-button" ? "Charakter" : "Aufträge";' e2e/aim253.glbActors.spec.ts
