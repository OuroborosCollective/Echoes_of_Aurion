sed -i 's/aria-label="Aufträge"/aria-label="Aufträge" data-testid="gamehud-quests-button"/' client/src/xaurion/components/GameHUD.tsx
sed -i 's/getByRole("button",{name:"Aufträge",exact:true})/getByTestId("gamehud-quests-button")/' e2e/aim292.npcMemory.spec.ts
