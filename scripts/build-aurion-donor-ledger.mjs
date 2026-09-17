#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ledgerPath = path.resolve(process.cwd(), "architecture/donor-ledger.json");

if (!fs.existsSync(ledgerPath)) {
  console.error("Missing donor ledger at", ledgerPath);
  process.exit(1);
}

const content = fs.readFileSync(ledgerPath, "utf-8");
const parsed = JSON.parse(content);

if (parsed.schema !== "aurion.donor.ledger.v1") {
  console.error("Invalid schema in donor ledger:", parsed.schema);
  process.exit(1);
}

const checksum = crypto.createHash("sha256").update(content, "utf-8").digest("hex");
console.log(`Donor ledger verified: ${parsed.capabilities.length} capabilities, SHA256: ${checksum}`);
