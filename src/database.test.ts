import { describe, expect, it, vi } from "vitest";
import { appendReferenceRows, loadExistingReferences, quoteIdentifier } from "./database.js";
import type { ColumnSchema, TableSchema } from "./schema.js";

const column = (overrides: Partial<ColumnSchema> = {}): ColumnSchema => ({
  name: "id", dataType: "integer", udtName: "int4", nullable: false,
  defaultExpression: null, identity: false, generated: false, maxLength: null,
  numericPrecision: 32, numericScale: 0, primaryKey: true, unique: false, ...overrides,
});

describe("database helpers", () => {
  it("escapes identifiers", () => expect(quoteIdentifier('odd"name')).toBe('"odd""name"'));

  it("loads distinct foreign-key targets once", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value: 3 }, { value: 5 }] });
    const orders: TableSchema = { schema: "public", name: "orders", columns: [
      column({ name: "buyer_id", foreignKey: { schema: "public", table: "users", column: "id" } }),
      column({ name: "seller_id", foreignKey: { schema: "public", table: "users", column: "id" } }),
    ] };
    const references = await loadExistingReferences({ query } as never, [orders], 10);
    expect(query).toHaveBeenCalledOnce();
    expect(references.get("public.users.id")).toEqual([3, 5]);
  });

  it("appends values returned by inserts", () => {
    const users: TableSchema = { schema: "public", name: "users", columns: [column()] };
    const references = new Map([["public.users.id", [1]]]);
    appendReferenceRows(references, users, [{ id: 2 }, { id: 3 }]);
    expect(references.get("public.users.id")).toEqual([1, 2, 3]);
  });

  it("loads existing values of unique columns", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value: "used@example.test" }] });
    const users: TableSchema = { schema: "public", name: "users", columns: [
      column({ name: "email", dataType: "text", unique: true }),
    ] };
    const references = await loadExistingReferences({ query } as never, [users], 10);
    expect(references.get("public.users.email")).toEqual(["used@example.test"]);
    expect(references.get("public.users.email#count")).toEqual([1]);
  });
});
