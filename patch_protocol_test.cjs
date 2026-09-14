const fs = require('fs');
const content = fs.readFileSync('server/wasdAurionCivilizationProtocol.test.ts', 'utf8');
const replacement = `resolveSettlement, resolveCollapseQualification } from "./wasdAurionCivilizationProtocol";`;
const updatedContent = content.replace(`resolveSettlement } from "./wasdAurionCivilizationProtocol";`, replacement);
const toAppend = `
  it("resolves collapse qualification deterministically and triggers on thresholds", () => {
    const safe = resolveCollapseQualification({ civilizationId: "civ-1", worldId: "world-1", worldEpoch: 1, population: 500, stability: 0.9, hazardIndex: 0.1, scarcitySeverity: 1, receiptId: "collapse-receipt-1" });
    expect(safe.isEligible).toBe(false);
    expect(safe.reason).toBe("none");

    const collapse = resolveCollapseQualification({ civilizationId: "civ-2", worldId: "world-1", worldEpoch: 1, population: 50, stability: 0.1, hazardIndex: 0.9, scarcitySeverity: 9, receiptId: "collapse-receipt-2" });
    expect(collapse.isEligible).toBe(true);
    expect(collapse.reason).toBe("instability");
    expect(collapse.receiptHash).toHaveLength(64);
  });
`;

if (!updatedContent.includes('resolveCollapseQualification')) {
  fs.writeFileSync('server/wasdAurionCivilizationProtocol.test.ts', updatedContent.replace(`});\n`, `});\n` + toAppend));
}
