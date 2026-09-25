import { describe, expect, it } from "vitest";
import { selectTables, tableConfig, validateConfigAgainstSchema } from "./config.js";
import type { TableSchema } from "./schema.js";

const tables: TableSchema[] = ["users", "orders", "audit_log"].map((name) => ({ schema: "public", name, columns: [] }));

describe("configuration", () => {
  it("selects requested tables and applies skip", () => {
    const config = { tables: { audit_log: { skip: true } } };
    expect(selectTables(tables, config, "users,orders").map((table) => table.name)).toEqual(["users", "orders"]);
    expect(selectTables(tables, config).map((table) => table.name)).toEqual(["users", "orders"]);
  });

  it("supports fully-qualified table configuration", () => {
    const config = { tables: { "public.users": { rows: 3 } } };
    expect(tableConfig(config, tables[0]).rows).toBe(3);
  });

  it("reports unknown tables", () => {
    expect(() => selectTables(tables, {}, "missing")).toThrow("Unknown or skipped tables: missing");
  });

  it("reports unknown and generated columns", () => {
    const schema: TableSchema[] = [{ schema: "public", name: "users", columns: [
      { name: "id", dataType: "bigint", udtName: "int8", nullable: false, defaultExpression: null,
        identity: true, generated: false, maxLength: null, numericPrecision: 64, numericScale: 0,
        primaryKey: true, unique: false },
    ] }];
    expect(() => validateConfigAgainstSchema({ tables: { users: { columns: { missing: { value: 1 } } } } }, schema))
      .toThrow("Configured column does not exist: public.users.missing");
    expect(() => validateConfigAgainstSchema({ tables: { users: { columns: { id: { value: 1 } } } } }, schema))
      .toThrow("Cannot configure database-generated column: public.users.id");
  });
});
