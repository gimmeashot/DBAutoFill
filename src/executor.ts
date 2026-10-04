import { quoteIdentifier } from "./database.js";
import type { TableSchema } from "./schema.js";
import { tableId } from "./schema.js";

interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export async function insertRows(database: Queryable, table: TableSchema, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) {
    const inserted: Record<string, unknown>[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const result = await database.query(`INSERT INTO ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} DEFAULT VALUES RETURNING *`);
      inserted.push(result.rows[0]);
    }
    return inserted;
  }
  const values = rows.flatMap((row) => columns.map((column) => row[column]));
  const placeholders = rows.map((_, rowIndex) =>
    `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`,
  );
  const sql = `INSERT INTO ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} (${columns.map(quoteIdentifier).join(", ")}) VALUES ${placeholders.join(", ")} RETURNING *`;
  const result = await database.query(sql, values);
  return result.rows;
}

export function assertCyclesAreNullable(tables: TableSchema[], cyclicTables: readonly string[]): void {
  const cyclic = new Set(cyclicTables);
  for (const table of tables) {
    if (!cyclic.has(tableId(table))) continue;
    for (const column of table.columns) {
      if (!column.foreignKey || !cyclic.has(`${column.foreignKey.schema}.${column.foreignKey.table}`)) continue;
      if (!column.nullable) {
        throw new Error(`Cyclic foreign key must be nullable in version 0.2: ${tableId(table)}.${column.name}`);
      }
    }
  }
}

export async function backfillCyclicForeignKeys(
  database: Queryable,
  tables: TableSchema[],
  cyclicTables: readonly string[],
  insertedByTable: ReadonlyMap<string, Record<string, unknown>[]>,
): Promise<number> {
  const cyclic = new Set(cyclicTables);
  let updated = 0;
  for (const table of tables) {
    if (!cyclic.has(tableId(table))) continue;
    const primaryKey = table.columns.filter((column) => column.primaryKey);
    if (primaryKey.length === 0) throw new Error(`Cannot backfill cyclic table without a primary key: ${tableId(table)}`);
    const groups = new Map<string, typeof table.columns>();
    for (const column of table.columns) {
      if (!column.foreignKey || !cyclic.has(`${column.foreignKey.schema}.${column.foreignKey.table}`)) continue;
      groups.set(column.foreignKey.constraintName, [...(groups.get(column.foreignKey.constraintName) ?? []), column]);
    }
    const sourceRows = insertedByTable.get(tableId(table)) ?? [];
    for (let index = 0; index < sourceRows.length; index += 1) {
      const sourceRow = sourceRows[index];
      const assignments = new Map<string, unknown>();
      for (const columns of groups.values()) {
        if (columns.some((column) => sourceRow[column.name] !== null && sourceRow[column.name] !== undefined)) continue;
        const foreignKey = columns[0].foreignKey!;
        const targetRows = insertedByTable.get(`${foreignKey.schema}.${foreignKey.table}`) ?? [];
        if (targetRows.length === 0) continue;
        const targetRow = targetRows[index % targetRows.length];
        for (const column of columns) assignments.set(column.name, targetRow[column.foreignKey!.column]);
      }
      if (assignments.size === 0) continue;
      const setEntries = [...assignments.entries()];
      const values = setEntries.map(([, value]) => value);
      const whereValues = primaryKey.map((column) => sourceRow[column.name]);
      const setSql = setEntries.map(([name], valueIndex) => `${quoteIdentifier(name)} = $${valueIndex + 1}`).join(", ");
      const whereSql = primaryKey.map((column, keyIndex) =>
        `${quoteIdentifier(column.name)} IS NOT DISTINCT FROM $${setEntries.length + keyIndex + 1}`).join(" AND ");
      await database.query(
        `UPDATE ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} SET ${setSql} WHERE ${whereSql}`,
        [...values, ...whereValues],
      );
      for (const [name, value] of assignments) sourceRow[name] = value;
      updated += 1;
    }
  }
  return updated;
}
