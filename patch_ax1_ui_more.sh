sed -i 's/getByRole("button", { name: "Charakter", exact: true })/getByTestId("gamehud-character-button")/' e2e/aim259.groups.spec.ts
sed -i 's/getByRole("button", { name: "Handwerk", exact: true })/getByTestId("gamehud-crafting-button")/' e2e/ax1.ui.spec.ts
sed -i 's/aria-label="Handwerk"/aria-label="Handwerk" data-testid="gamehud-crafting-button"/' client/src/xaurion/components/GameHUD.tsx
sed -i 's/getByRole("button", { name: "Gruppe", exact: true })/getByTestId("gamehud-party-button")/' e2e/aim259.groups.spec.ts
sed -i 's/aria-label="Gruppe"/aria-label="Gruppe" data-testid="gamehud-party-button"/' client/src/xaurion/components/GameHUD.tsx
sed -i 's/getByRole("button", { name: "Weltatlas \[M\]", exact: true })/getByTestId("gamehud-map-button")/' e2e/ax1.ui.spec.ts
sed -i 's/aria-label="Weltatlas"/aria-label="Weltatlas" data-testid="gamehud-map-button"/' client/src/xaurion/components/GameHUD.tsx
