import { createHash } from 'node:crypto';

const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const tag = /^[0-9]{4}_[a-z0-9_]{1,96}$/;
const states = new Set(['ABSENT_APPLY_REQUIRED', 'PRESENT_SCHEMA_DRIFT', 'PRESENT_SCHEMA_MATCH']);
const driftKinds = new Set(['missing_table', 'missing_column', 'type', 'nullability', 'default', 'extra', 'unexpected_column', 'missing_index', 'index_uniqueness', 'index_columns', 'unexpected_index', 'missing_check', 'check_expression', 'unexpected_check', 'missing_trigger', 'trigger_contract', 'unexpected_trigger']);
const errorClasses = new Set(['REVIEWED_JOURNAL_SOURCE_CHANGED', 'REVIEWED_TRANSITION_SOURCE_CHANGED', 'REVIEWED_TRANSITION_CONTRACT_MISSING', 'REPAIR_MODE_INVALID', 'DATABASE_URL_MISSING', 'DATABASE_URL_INVALID', 'DATABASE_LOCK_UNAVAILABLE', 'REPAIR_IDENTITY_INVALID', 'REPAIR_READBACK_IDENTITY_MISMATCH', 'REPAIR_READBACK_STALE', 'REPAIR_MIGRATION_COVERAGE_INVALID', 'REPAIR_DUPLICATE_TABLE', 'REPAIR_HISTORY_INVALID', 'REPAIR_SOURCE_HISTORY_MISMATCH', 'REPAIR_INDEX_SOURCE_INVALID', 'UNSUPPORTED_SCHEMA_STRUCTURE', 'JOURNAL_UNREADABLE_OR_AMBIGUOUS', 'REPAIR_EXECUTION_FAILED']);
const stages = new Set(['INITIALIZE', 'PREFLIGHT_SCHEMA']);

function canonicalJson(value) {
  const canonical = item => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)])) : item;
  return JSON.stringify(canonical(value));
}

function blockerDetails(value) {
  if (typeof value !== 'string') return { code: 'UNCLASSIFIED_BLOCKER' };
  const [code, first, second, third] = value.split(':');
  if (['REVIEWED_CRAFTING_COLUMN_MISSING','REVIEWED_PROVENANCE_PRESTATE_UNKNOWN','REVIEWED_CRAFTING_INDEX_PRESTATE_UNKNOWN','REVIEWED_CRAFTING_REPLACEMENT_INDEX_INVALID','JOURNAL_UNREADABLE_OR_AMBIGUOUS', 'JOURNAL_IDENTITY_CONFLICT'].includes(code) && value === code) return { code };
  if (['HISTORICAL_JOURNAL_GAP', 'UNEXPECTED_JOURNAL_GAP'].includes(code) && tag.test(first ?? '') && second === undefined) return { code, migration: first };
  if (code === 'UNEXPECTED_MIGRATION_STATE' && tag.test(first ?? '') && states.has(second) && third === undefined) return { code, migration: first, state: second };
  if (code === 'UNKNOWN_TABLE' && identifier.test(first ?? '') && second === undefined) return { code, table: first };
  if (code === 'RECORDED_MIGRATION_TABLE_MISSING' && tag.test(first ?? '') && identifier.test(second ?? '') && third === undefined) return { code, migration: first, table: second };
  if (code === 'REQUIRED_COLUMN_WITHOUT_DEFAULT' && second === undefined) {
    const [table, column, extra] = (first ?? '').split('.');
    if (identifier.test(table ?? '') && identifier.test(column ?? '') && extra === undefined) return { code, table, field: column };
  }
  if (code === 'OPERATOR_REVIEW_REQUIRED' && identifier.test(first ?? '') && driftKinds.has(second)) {
    if (second === 'missing_table' && third === undefined) return { code, table: first, kind: second };
    // Type discrepancies can contain observed enum/default values. Return only
    // identifiers and the category, never the SQL types or raw reason suffix.
    if (identifier.test(third ?? '')) return { code, table: first, kind: second, field: third };
  }
  return { code: 'UNCLASSIFIED_BLOCKER' };
}

/** Diagnostic projection only: no SQL, journal rows, driver text or authority. */
export function schemaRepairFailureReceipt(value, sourceRevision, ledgerPlanSha256) {
  if (!/^[a-f0-9]{40}$/.test(sourceRevision) || !/^[a-f0-9]{64}$/.test(ledgerPlanSha256)) return null;
  const base = { schemaVersion: 1, recordType: 'aurion_schema_repair_failure_readback', sourceRevision, ledgerPlanSha256, databaseCredentialReturned: false };
  if (value?.recordType === 'aurion_production_schema_apply_execution' && value.schemaVersion === 1
    && value.sourceRevision === sourceRevision && value.planSha256 === ledgerPlanSha256
    && value.executionMode === 'plan' && value.state === 'APPLY_FAILED' && value.databaseCredentialReturned === false
    && errorClasses.has(value.errorClass) && stages.has(value.failureStage)) {
    return { ...base, kind: 'EXECUTION_ERROR', failureStage: value.failureStage, errorClass: value.errorClass };
  }
  if (!['aurion.schema-repair-plan.v1','aurion.schema-repair-plan.v2'].includes(value?.schemaVersion) || value.sourceRevision !== sourceRevision
    || value.ledgerPlanSha256 !== ledgerPlanSha256 || value.decision !== 'BLOCKED_OPERATOR_REVIEW'
    || !Array.isArray(value.blockers) || value.blockers.length < 1 || value.blockers.length > 10000
    || !Array.isArray(value.affected) || value.affected.length > 100) return null;
  const { repairPlanSha256, ...body } = value;
  if (!/^[a-f0-9]{64}$/.test(repairPlanSha256 ?? '')
    || createHash('sha256').update(canonicalJson(body)).digest('hex') !== repairPlanSha256) return null;
  const blockers = value.blockers.slice(0, 200).map(blockerDetails);
  const affected = value.affected.filter(m => tag.test(m?.tag ?? '') && states.has(m?.state)).map(m => ({ tag: m.tag, state: m.state }));
  return { ...base, kind: 'BLOCKED_PLAN', repairPlanSha256, decision: value.decision,
    blockerCount: value.blockers.length, truncated: value.blockers.length > blockers.length,
    blockers, affected };
}
