import pg from "pg";
import type { ColumnSchema, ForeignKeySchema, TableSchema } from "./schema.js";
import { tableId } from "./schema.js";

const { Pool } = pg;

export type DbPool = InstanceType<typeof Pool>;

export function createPool(connectionString: string): DbPool {
  return new Pool({ connectionString, max: 4 });
}

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_identity: "YES" | "NO";
  is_generated: "NEVER" | "ALWAYS";
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

export async function inspectSchema(pool: DbPool, schema: string): Promise<TableSchema[]> {
  const [columnsResult, constraintsResult, enumResult] = await Promise.all([
    pool.query<ColumnRow>(`
      SELECT table_schema, table_name, column_name, data_type, udt_name,
             is_nullable, column_default, is_identity, is_generated,
             character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`, [schema]),
    pool.query<{
      table_schema: string; table_name: string; column_name: string;
      constraint_type: "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY";
      foreign_table_schema: string | null; foreign_table_name: string | null;
      foreign_column_name: string | null;
    }>(`
      SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_type,
             ccu.table_schema AS foreign_table_schema,
             ccu.table_name AS foreign_table_name,
             ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
       AND tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_catalog = ccu.constraint_catalog
       AND tc.constraint_schema = ccu.constraint_schema
       AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = $1
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')`, [schema]),
    pool.query<{ type_name: string; value: string }>(`
      SELECT t.typname AS type_name, e.enumlabel AS value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1
      ORDER BY t.typname, e.enumsortorder`, [schema]),
  ]);

  const constraintMap = new Map<string, { primaryKey: boolean; unique: boolean; foreignKey?: ForeignKeySchema }>();
  for (const row of constraintsResult.rows) {
    const key = `${row.table_schema}.${row.table_name}.${row.column_name}`;
    const current = constraintMap.get(key) ?? { primaryKey: false, unique: false };
    if (row.constraint_type === "PRIMARY KEY") current.primaryKey = true;
    if (row.constraint_type === "UNIQUE") current.unique = true;
    if (row.constraint_type === "FOREIGN KEY" && row.foreign_table_schema && row.foreign_table_name && row.foreign_column_name) {
      current.foreignKey = {
        schema: row.foreign_table_schema,
        table: row.foreign_table_name,
        column: row.foreign_column_name,
      };
    }
    constraintMap.set(key, current);
  }

  const enums = new Map<string, string[]>();
  for (const row of enumResult.rows) enums.set(row.type_name, [...(enums.get(row.type_name) ?? []), row.value]);

  const tables = new Map<string, TableSchema>();
  for (const row of columnsResult.rows) {
    const id = `${row.table_schema}.${row.table_name}`;
    const table = tables.get(id) ?? { schema: row.table_schema, name: row.table_name, columns: [] };
    const constraint = constraintMap.get(`${id}.${row.column_name}`);
    const column: ColumnSchema = {
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === "YES",
      defaultExpression: row.column_default,
      identity: row.is_identity === "YES",
      generated: row.is_generated !== "NEVER",
      maxLength: row.character_maximum_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
      primaryKey: constraint?.primaryKey ?? false,
      unique: constraint?.unique ?? false,
      foreignKey: constraint?.foreignKey,
      enumValues: enums.get(row.udt_name),
    };
    table.columns.push(column);
    tables.set(id, table);
  }
  return [...tables.values()];
}

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function loadExistingReferences(
  database: Pick<DbPool, "query">,
  tables: TableSchema[],
  limit: number,
): Promise<Map<string, unknown[]>> {
  const targets = new Map<string, ForeignKeySchema>();
  for (const table of tables) {
    for (const column of table.columns) {
      if (column.foreignKey) {
        const foreignKey = column.foreignKey;
        targets.set(`${foreignKey.schema}.${foreignKey.table}.${foreignKey.column}`, foreignKey);
      }
      if (column.unique) {
        targets.set(`${tableId(table)}.${column.name}`, {
          schema: table.schema,
          table: table.name,
          column: column.name,
        });
      }
    }
  }

  const references = new Map<string, unknown[]>();
  for (const [key, target] of targets) {
    const column = quoteIdentifier(target.column);
    const result = await database.query<{ value: unknown; total_count?: number }>(
      `SELECT ${column} AS value, count(*) OVER()::int AS total_count FROM ${quoteIdentifier(target.schema)}.${quoteIdentifier(target.table)} WHERE ${column} IS NOT NULL LIMIT $1`,
      [limit],
    );
    references.set(key, result.rows.map((row) => row.value));
    references.set(`${key}#count`, [result.rows[0]?.total_count ?? result.rows.length]);
  }
  return references;
}

export function appendReferenceRows(
  references: Map<string, unknown[]>,
  table: TableSchema,
  rows: Record<string, unknown>[],
): void {
  for (const column of table.columns) {
    const values = rows.map((row) => row[column.name]).filter((value) => value !== null && value !== undefined);
    if (values.length === 0) continue;
    const key = `${tableId(table)}.${column.name}`;
    references.set(key, [...(references.get(key) ?? []), ...values]);
    if (column.unique) {
      const previousCount = Number(references.get(`${key}#count`)?.[0] ?? 0);
      references.set(`${key}#count`, [previousCount + values.length]);
    }
  }
}
