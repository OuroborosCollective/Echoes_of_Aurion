sed -i 's/getByRole("button", { name: "Inventar", exact: true })/getByTestId("gamehud-inventory-button")/' e2e/ax1.ui.spec.ts
sed -i 's/aria-label="Inventar"/aria-label="Inventar" data-testid="gamehud-inventory-button"/' client/src/xaurion/components/GameHUD.tsx

sed -i 's/getByRole("button", { name: "Charakter", exact: true })/getByTestId("gamehud-character-button")/' e2e/ax1.ui.spec.ts
sed -i 's/aria-label="Charakter"/aria-label="Charakter" data-testid="gamehud-character-button"/' client/src/xaurion/components/GameHUD.tsx
