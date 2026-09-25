import { describe, expect, it } from "vitest";
import { generateRows, generateValue, seedGenerator } from "./generator.js";
import type { ColumnSchema, TableSchema } from "./schema.js";

const column = (overrides: Partial<ColumnSchema> = {}): ColumnSchema => ({
  name: "value", dataType: "text", udtName: "text", nullable: false,
  defaultExpression: null, identity: false, generated: false, maxLength: null,
  numericPrecision: null, numericScale: null, primaryKey: false, unique: false,
  ...overrides,
});

describe("data generation", () => {
  it("is repeatable with a seed", () => {
    seedGenerator(7);
    const first = generateValue(column({ name: "email" }), 0);
    seedGenerator(7);
    expect(generateValue(column({ name: "email" }), 0)).toBe(first);
  });

  it("uses generated parent values for foreign keys", () => {
    const table: TableSchema = { schema: "public", name: "orders", columns: [
      column({ name: "user_id", dataType: "integer", foreignKey: { schema: "public", table: "users", column: "id" } }),
    ] };
    const references = new Map([["public.users.id", [10, 20]]]);
    expect(generateRows(table, 3, references)).toEqual([{ user_id: 10 }, { user_id: 20 }, { user_id: 10 }]);
  });

  it("omits identity columns", () => {
    const table: TableSchema = { schema: "public", name: "users", columns: [column({ name: "id", identity: true })] };
    expect(generateRows(table, 1)).toEqual([{}]);
  });

  it("guarantees unique semantic values", () => {
    seedGenerator(9);
    const email = column({ name: "email", unique: true, maxLength: 120 });
    const values = [generateValue(email, 0), generateValue(email, 1)];
    expect(new Set(values).size).toBe(2);
    expect(values.every((value) => String(value).includes("@"))).toBe(true);
  });

  it("allows configuration to override a database default", () => {
    const table: TableSchema = { schema: "public", name: "users", columns: [
      column({ name: "status", defaultExpression: "'active'::text" }),
    ] };
    expect(generateRows(table, 2, new Map(), { status: { value: "blocked" } }))
      .toEqual([{ status: "blocked" }, { status: "blocked" }]);
  });

  it("offsets generated unique values when the table already contains rows", () => {
    const table: TableSchema = { schema: "public", name: "users", columns: [
      column({ name: "code", unique: true }),
    ] };
    const references = new Map<string, unknown[]>([["public.users.code", ["code_1"]], ["public.users.code#count", [2]]]);
    expect(generateRows(table, 2, references)).toEqual([{ code: "code_3" }, { code: "code_4" }]);
  });
});
