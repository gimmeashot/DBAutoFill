import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ColumnRule } from "./generator.js";
import type { TableSchema } from "./schema.js";
import { tableId } from "./schema.js";

export interface TableConfig {
  skip?: boolean;
  rows?: number;
  columns?: Record<string, ColumnRule>;
}

export interface AppConfig {
  schema?: string;
  defaultRows?: number;
  tables?: Record<string, TableConfig>;
}

export async function loadConfig(path?: string): Promise<AppConfig> {
  if (!path) return {};
  const absolutePath = resolve(path);
  const extension = extname(absolutePath).toLowerCase();
  let value: unknown;
  if (extension === ".json") {
    value = JSON.parse(await readFile(absolutePath, "utf8"));
  } else if ([".js", ".mjs", ".cjs"].includes(extension)) {
    const module = await import(pathToFileURL(absolutePath).href);
    value = module.default ?? module;
  } else {
    throw new Error("Config must be a .json, .js, .mjs or .cjs file");
  }
  validateConfig(value);
  return value;
}

export function selectTables(
  tables: TableSchema[],
  config: AppConfig,
  requested?: string,
): TableSchema[] {
  validateConfigAgainstSchema(config, tables);
  const names = requested ? new Set(requested.split(",").map((name) => name.trim()).filter(Boolean)) : undefined;
  if (names?.size === 0) throw new Error("--tables must contain at least one table name");

  const selected = tables.filter((table) => {
    const shortName = table.name;
    const fullName = tableId(table);
    const tableConfig = config.tables?.[fullName] ?? config.tables?.[shortName];
    return !tableConfig?.skip && (!names || names.has(shortName) || names.has(fullName));
  });

  if (names) {
    const found = new Set(selected.flatMap((table) => [table.name, tableId(table)]));
    const missing = [...names].filter((name) => !found.has(name));
    if (missing.length) throw new Error(`Unknown or skipped tables: ${missing.join(", ")}`);
  }
  return selected;
}

export function validateConfigAgainstSchema(config: AppConfig, tables: TableSchema[]): void {
  if (!config.tables) return;
  const byFullName = new Map(tables.map((table) => [tableId(table), table]));
  const byShortName = new Map(tables.map((table) => [table.name, table]));
  for (const [configuredName, configuredTable] of Object.entries(config.tables)) {
    const table = byFullName.get(configuredName) ?? byShortName.get(configuredName);
    if (!table) throw new Error(`Configured table does not exist in the inspected schema: ${configuredName}`);
    const columns = new Map(table.columns.map((column) => [column.name, column]));
    for (const columnName of Object.keys(configuredTable.columns ?? {})) {
      const column = columns.get(columnName);
      if (!column) throw new Error(`Configured column does not exist: ${tableId(table)}.${columnName}`);
      if (column.identity || column.generated) {
        throw new Error(`Cannot configure database-generated column: ${tableId(table)}.${columnName}`);
      }
    }
  }
}

export function tableConfig(config: AppConfig, table: TableSchema): TableConfig {
  return config.tables?.[tableId(table)] ?? config.tables?.[table.name] ?? {};
}

function validateConfig(value: unknown): asserts value is AppConfig {
  if (!isRecord(value)) throw new Error("Config must export an object");
  if (value.schema !== undefined && typeof value.schema !== "string") throw new Error("config.schema must be a string");
  validatePositiveInteger(value.defaultRows, "config.defaultRows");
  if (value.tables === undefined) return;
  if (!isRecord(value.tables)) throw new Error("config.tables must be an object");
  for (const [name, rawTable] of Object.entries(value.tables)) {
    if (!isRecord(rawTable)) throw new Error(`config.tables.${name} must be an object`);
    if (rawTable.skip !== undefined && typeof rawTable.skip !== "boolean") throw new Error(`config.tables.${name}.skip must be boolean`);
    validatePositiveInteger(rawTable.rows, `config.tables.${name}.rows`);
    if (rawTable.columns !== undefined && !isRecord(rawTable.columns)) throw new Error(`config.tables.${name}.columns must be an object`);
    if (isRecord(rawTable.columns)) {
      for (const [column, rule] of Object.entries(rawTable.columns)) {
        if (!isRecord(rule)) throw new Error(`Rule for ${name}.${column} must be an object`);
        if (!("value" in rule) && !("values" in rule)) throw new Error(`Rule for ${name}.${column} needs value or values`);
        if ("values" in rule && (!Array.isArray(rule.values) || rule.values.length === 0)) throw new Error(`values for ${name}.${column} must be a non-empty array`);
      }
    }
  }
}

function validatePositiveInteger(value: unknown, path: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 1)) throw new Error(`${path} must be a positive integer`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
