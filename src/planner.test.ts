import { describe, expect, it } from "vitest";
import { createGenerationPlan } from "./planner.js";
import type { ColumnSchema, TableSchema } from "./schema.js";

const column = (overrides: Partial<ColumnSchema> = {}): ColumnSchema => ({
  name: "id", dataType: "integer", udtName: "int4", nullable: false,
  defaultExpression: null, identity: false, generated: false, maxLength: null,
  numericPrecision: 32, numericScale: 0, primaryKey: true, unique: false, ...overrides,
});

const table = (name: string, columns: ColumnSchema[] = [column()]): TableSchema => ({ schema: "public", name, columns });

describe("createGenerationPlan", () => {
  it("puts referenced tables first", () => {
    const users = table("users");
    const orders = table("orders", [column(), column({ name: "user_id", foreignKey: { schema: "public", table: "users", column: "id" } })]);
    expect(createGenerationPlan([orders, users]).orderedTables.map((item) => item.name)).toEqual(["users", "orders"]);
  });

  it("reports cycles", () => {
    const a = table("a", [column({ foreignKey: { schema: "public", table: "b", column: "id" } })]);
    const b = table("b", [column({ foreignKey: { schema: "public", table: "a", column: "id" } })]);
    expect(createGenerationPlan([a, b]).cyclicTables).toEqual(["public.a", "public.b"]);
  });
});
