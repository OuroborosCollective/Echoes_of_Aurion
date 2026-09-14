const fs = require('fs');
const content = fs.readFileSync('server/wasdAurionCivilizationProtocol.ts', 'utf8');
const toAppend = `
export type CollapseQualification = {
  civilizationId: string;
  worldId: string;
  worldEpoch: number;
  isEligible: boolean;
  reason: string;
  receiptHash: string;
};

export function resolveCollapseQualification(input: {
  civilizationId: string;
  worldId: string;
  worldEpoch: number;
  population: number;
  stability: number;
  hazardIndex: number;
  scarcitySeverity: number;
  receiptId: string;
}): CollapseQualification {
  const isEligible = input.population < 100 && (input.stability < 0.2 || input.hazardIndex > 0.8 || input.scarcitySeverity > 8);
  let reason = "none";
  if (isEligible) {
    if (input.population < 100 && input.stability < 0.2) reason = "instability";
    else if (input.hazardIndex > 0.8) reason = "hazard";
    else if (input.scarcitySeverity > 8) reason = "famine";
    else reason = "depopulation";
  }
  const receiptHash = hash(["wasd:collapse:v1", input.receiptId, input.civilizationId, input.worldId, String(input.worldEpoch), String(isEligible), reason]);
  return {
    civilizationId: input.civilizationId,
    worldId: input.worldId,
    worldEpoch: input.worldEpoch,
    isEligible,
    reason,
    receiptHash
  };
}
`;
if (!content.includes('resolveCollapseQualification')) {
  fs.writeFileSync('server/wasdAurionCivilizationProtocol.ts', content + toAppend);
}
