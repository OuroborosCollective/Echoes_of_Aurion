from pathlib import Path

path = Path("scripts/reconcile-aurion-production-schema.ts")
text = path.read_text(encoding="utf-8")

old_import = '''} from "./aurionProductionSchemaReconciliation";
'''
new_import = '''} from "./aurionProductionSchemaReconciliation";
import { classifyAurionProductionReadbackFailure } from "./aurionProductionReadbackFailure";
'''
if text.count(old_import) != 1:
    raise SystemExit(f"expected one reconciliation import boundary, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

old_receipt = '''function unreadableReceipt(error: unknown) {
  const errorName = error instanceof Error && /^[A-Za-z0-9_.$ -]{1,120}$/.test(error.name) ? error.name : "UnknownError";
  return {
    recordType: "aurion_production_schema_reconciliation",
    schemaVersion: 1,
    sourceRevision,
    readOnly: true,
    requireMatch,
    databaseCredentialReturned: false,
    overallState: "UNREADABLE_FAIL_CLOSED",
    errorName,
    migrations: lateAurionMigrationTags.map(tag => ({ tag, state: "UNREADABLE_FAIL_CLOSED" })),
  };
}
'''
new_receipt = '''function unreadableReceipt(error: unknown) {
  const errorName = error instanceof Error && /^[A-Za-z0-9_.$ -]{1,120}$/.test(error.name) ? error.name : "UnknownError";
  const failure = classifyAurionProductionReadbackFailure(error);
  return {
    recordType: "aurion_production_schema_reconciliation",
    schemaVersion: 1,
    sourceRevision,
    readOnly: true,
    requireMatch,
    databaseCredentialReturned: false,
    overallState: "UNREADABLE_FAIL_CLOSED",
    errorName,
    failure,
    migrations: lateAurionMigrationTags.map(tag => ({ tag, state: "UNREADABLE_FAIL_CLOSED" })),
  };
}
'''
if text.count(old_receipt) != 1:
    raise SystemExit(f"expected one unreadable receipt boundary, found {text.count(old_receipt)}")
text = text.replace(old_receipt, new_receipt, 1)
path.write_text(text, encoding="utf-8")
