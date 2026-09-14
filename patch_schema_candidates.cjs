const fs = require('fs');
let content = fs.readFileSync('drizzle/schema.ts', 'utf8');

const toAppend = `
export const aurionSettlementRebirthCandidates = mysqlTable("aurionSettlementRebirthCandidates", {
  candidateId: varchar("candidateId", { length: 64 }).primaryKey(),
  worldId: varchar("worldId", { length: 64 }).notNull(),
  locationIdentity: varchar("locationIdentity", { length: 255 }).notNull(),
  ruinId: varchar("ruinId", { length: 64 }),
  eligibilityReceipt: varchar("eligibilityReceipt", { length: 64 }).notNull(),
  candidateSeedDigest: varchar("candidateSeedDigest", { length: 64 }).notNull(),
  state: mysqlEnum("state", ["INELIGIBLE", "ELIGIBLE", "MATERIALIZED", "REJECTED"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
`;

if (!content.includes('aurionSettlementRebirthCandidates')) {
  fs.writeFileSync('drizzle/schema.ts', content + toAppend);
}
