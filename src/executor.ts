import { quoteIdentifier } from "./database.js";
import type { TableSchema } from "./schema.js";

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
