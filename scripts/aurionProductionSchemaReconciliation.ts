export const lateAurionMigrationTags = [
  "0021_aurion_global_world_state",
  "0022_aurion_world_chunk_deltas",
  "0023_aurion_world_presence_epochs",
  "0024_aurion_world_epoch_reactions",
  "0025_aurion_loot_mastery_ethos",
  "0026_aurion_faction_questline_state",
  "0027_aurion_faction_questline_rewards",
] as const;

export type LateAurionMigrationTag = (typeof lateAurionMigrationTags)[number];
export type ReconciliationState =
  | "ABSENT_APPLY_REQUIRED"
  | "PRESENT_SCHEMA_MATCH"
  | "PRESENT_SCHEMA_DRIFT"
  | "UNREADABLE_FAIL_CLOSED";

export type ExpectedColumn = Readonly<{
  name: string;
  sqlType: string;
  nullable: boolean;
}>;

export type ExpectedIndex = Readonly<{
  name: string;
  unique: boolean;
  columns: readonly string[];
}>;

export type ExpectedTable = Readonly<{
  name: string;
  columns: readonly ExpectedColumn[];
  indexes: readonly ExpectedIndex[];
}>;

export type ExpectedMigration = Readonly<{
  tag: LateAurionMigrationTag;
  tables: readonly ExpectedTable[];
}>;

export type ObservedColumn = Readonly<{
  name: string;
  columnType: string;
  nullable: boolean;
}>;

export type ObservedIndex = Readonly<{
  name: string;
  unique: boolean;
  columns: readonly string[];
}>;

export type ObservedTable = Readonly<{
  name: string;
  columns: readonly ObservedColumn[];
  indexes: readonly ObservedIndex[];
}>;

export type MigrationClassification = Readonly<{
  tag: LateAurionMigrationTag;
  state: ReconciliationState;
  expectedTables: readonly string[];
  presentTables: readonly string[];
  missingTables: readonly string[];
  drift: readonly string[];
}>;

function removeSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "").replace(/^\s*#.*$/gm, "");
}

function maskQuotedSqlLiterals(value: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!quote) {
      if (char === "'" || char === '"') {
        quote = char;
        result += " ";
      } else {
        result += char;
      }
      continue;
    }

    result += " ";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      if (value[index + 1] === quote) {
        result += " ";
        index += 1;
      } else {
        quote = null;
      }
    }
  }
  return result;
}

function scanBalancedBody(sql: string, openingIndex: number): { body: string; end: number } {
  let depth = 1;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let index = openingIndex + 1; index < sql.length; index += 1) {
    const char = sql[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && char === "\\" && quote !== "`") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return { body: sql.slice(openingIndex + 1, index), end: index + 1 };
    }
  }
  throw new Error("Unbalanced CREATE TABLE body in migration SQL");
}

function splitTopLevelComma(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && char === "\\" && quote !== "`") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function takeSqlType(definition: string): string {
  const boundaryKeywords = ["NOT NULL", "NULL", "DEFAULT", "AUTO_INCREMENT", "PRIMARY KEY", "UNIQUE", "COMMENT", "REFERENCES", "ON UPDATE"];
  let depth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < definition.length; index += 1) {
    const char = definition[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (/\s/.test(char) && depth === 0) {
      const remainder = definition.slice(index).trimStart().toUpperCase();
      if (boundaryKeywords.some(keyword => remainder === keyword || remainder.startsWith(`${keyword} `))) {
        return definition.slice(0, index).trim();
      }
    }
  }
  return definition.trim();
}

function indexColumns(value: string): string[] {
  return Array.from(value.matchAll(/`([^`]+)`/g), match => match[1]);
}

function parseIndexClause(clause: string): ExpectedIndex | null {
  let match = clause.match(/^CONSTRAINT\s+`[^`]+`\s+PRIMARY\s+KEY\s*\((.+)\)$/i)
    ?? clause.match(/^PRIMARY\s+KEY\s*\((.+)\)$/i);
  if (match) return { name: "PRIMARY", unique: true, columns: indexColumns(match[1]) };

  match = clause.match(/^CONSTRAINT\s+`([^`]+)`\s+UNIQUE(?:\s+(?:KEY|INDEX))?\s*\((.+)\)$/i);
  if (match) return { name: match[1], unique: true, columns: indexColumns(match[2]) };

  match = clause.match(/^UNIQUE\s+(?:KEY|INDEX)\s+`([^`]+)`\s*\((.+)\)$/i);
  if (match) return { name: match[1], unique: true, columns: indexColumns(match[2]) };

  match = clause.match(/^(?:KEY|INDEX)\s+`([^`]+)`\s*\((.+)\)$/i);
  if (match) return { name: match[1], unique: false, columns: indexColumns(match[2]) };
  return null;
}

function parseCreateTable(name: string, body: string): ExpectedTable {
  const columns: ExpectedColumn[] = [];
  const indexes: ExpectedIndex[] = [];
  for (const clause of splitTopLevelComma(body)) {
    const columnMatch = clause.match(/^`([^`]+)`\s+([\s\S]+)$/);
    if (columnMatch) {
      const definition = columnMatch[2].trim();
      const constraintText = maskQuotedSqlLiterals(definition);
      columns.push({
        name: columnMatch[1],
        sqlType: takeSqlType(definition),
        nullable: !/\bNOT\s+NULL\b/i.test(constraintText),
      });
      if (/\bPRIMARY\s+KEY\b/i.test(constraintText)) indexes.push({ name: "PRIMARY", unique: true, columns: [columnMatch[1]] });
      else if (/\bUNIQUE\b/i.test(constraintText)) indexes.push({ name: `inline_unique:${columnMatch[1]}`, unique: true, columns: [columnMatch[1]] });
      continue;
    }
    const parsedIndex = parseIndexClause(clause);
    if (parsedIndex) indexes.push(parsedIndex);
  }
  if (columns.length === 0) throw new Error(`${name}: CREATE TABLE contains no parsed columns`);
  return { name, columns, indexes };
}

export function parseLateMigrationSql(tag: LateAurionMigrationTag, sourceSql: string): ExpectedMigration {
  const sql = removeSqlComments(sourceSql);
  const tables: ExpectedTable[] = [];
  const createPattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`([^`]+)`\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createPattern.exec(sql))) {
    const openingIndex = createPattern.lastIndex - 1;
    const { body, end } = scanBalancedBody(sql, openingIndex);
    tables.push(parseCreateTable(match[1], body));
    createPattern.lastIndex = end;
  }
  if (tables.length === 0) throw new Error(`${tag}: no CREATE TABLE statements found`);

  const tableMap = new Map(tables.map(table => [table.name, { ...table, indexes: [...table.indexes] }]));
  const externalIndexPattern = /CREATE\s+(UNIQUE\s+)?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`\s*\(([^;]+)\)\s*;/gi;
  while ((match = externalIndexPattern.exec(sql))) {
    const table = tableMap.get(match[3]);
    if (!table) throw new Error(`${tag}: index ${match[2]} references unknown table ${match[3]}`);
    table.indexes.push({ name: match[2], unique: Boolean(match[1]), columns: indexColumns(match[4]) });
  }
  return { tag, tables: Array.from(tableMap.values()) };
}

function normalizeType(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/int\(\d+\)/g, "int");
}

function expectedIndexName(index: ExpectedIndex): string {
  return index.name.startsWith("inline_unique:") ? index.name.slice("inline_unique:".length) : index.name;
}

export function compareTableContract(expected: ExpectedTable, observed: ObservedTable): string[] {
  const drift: string[] = [];
  const expectedColumns = new Map(expected.columns.map(column => [column.name, column]));
  const observedColumns = new Map(observed.columns.map(column => [column.name, column]));
  for (const [name, column] of expectedColumns) {
    const actual = observedColumns.get(name);
    if (!actual) {
      drift.push(`${expected.name}:missing_column:${name}`);
      continue;
    }
    if (normalizeType(column.sqlType) !== normalizeType(actual.columnType)) {
      drift.push(`${expected.name}:type:${name}:expected=${normalizeType(column.sqlType)}:observed=${normalizeType(actual.columnType)}`);
    }
    if (column.nullable !== actual.nullable) drift.push(`${expected.name}:nullability:${name}`);
  }
  for (const name of observedColumns.keys()) {
    if (!expectedColumns.has(name)) drift.push(`${expected.name}:unexpected_column:${name}`);
  }

  const expectedIndexes = new Map(expected.indexes.map(index => [expectedIndexName(index), index]));
  const observedIndexes = new Map(observed.indexes.map(index => [index.name, index]));
  for (const [name, index] of expectedIndexes) {
    const actual = observedIndexes.get(name);
    if (!actual) {
      drift.push(`${expected.name}:missing_index:${name}`);
      continue;
    }
    if (index.unique !== actual.unique) drift.push(`${expected.name}:index_uniqueness:${name}`);
    if (index.columns.join(",") !== actual.columns.join(",")) drift.push(`${expected.name}:index_columns:${name}`);
  }
  for (const name of observedIndexes.keys()) {
    if (!expectedIndexes.has(name)) drift.push(`${expected.name}:unexpected_index:${name}`);
  }
  return drift.sort();
}

export function classifyMigrationContract(expected: ExpectedMigration, observedTables: ReadonlyMap<string, ObservedTable>): MigrationClassification {
  const expectedNames = expected.tables.map(table => table.name).sort();
  const presentNames = expectedNames.filter(name => observedTables.has(name));
  const missingNames = expectedNames.filter(name => !observedTables.has(name));
  if (presentNames.length === 0) {
    return { tag: expected.tag, state: "ABSENT_APPLY_REQUIRED", expectedTables: expectedNames, presentTables: [], missingTables: expectedNames, drift: [] };
  }

  const drift = expected.tables.flatMap(table => {
    const observed = observedTables.get(table.name);
    return observed ? compareTableContract(table, observed) : [`${table.name}:missing_table`];
  }).sort();
  return {
    tag: expected.tag,
    state: missingNames.length === 0 && drift.length === 0 ? "PRESENT_SCHEMA_MATCH" : "PRESENT_SCHEMA_DRIFT",
    expectedTables: expectedNames,
    presentTables: presentNames,
    missingTables: missingNames,
    drift,
  };
}
