import { describe, expect, it, vi } from "vitest";
import { assertCyclesAreNullable, backfillCyclicForeignKeys } from "./executor.js";
import type { ColumnSchema, TableSchema } from "./schema.js";

const column = (name: string, overrides: Partial<ColumnSchema> = {}): ColumnSchema => ({
  name, dataType: "bigint", udtName: "int8", nullable: false, defaultExpression: null,
  identity: false, generated: false, maxLength: null, numericPrecision: 64,
  numericScale: 0, primaryKey: false, unique: false, ...overrides,
});

const departments: TableSchema = { schema: "public", name: "departments", columns: [
  column("id", { primaryKey: true }),
  column("lead_id", { nullable: true, foreignKey: { constraintName: "departments_lead_fk", schema: "public", table: "employees", column: "id" } }),
] };
const employees: TableSchema = { schema: "public", name: "employees", columns: [
  column("id", { primaryKey: true }),
  column("department_id", { nullable: true, foreignKey: { constraintName: "employees_department_fk", schema: "public", table: "departments", column: "id" } }),
] };

describe("cyclic foreign keys", () => {
  it("rejects non-nullable cyclic edges", () => {
    const invalid = structuredClone(departments);
    invalid.columns[1].nullable = false;
    expect(() => assertCyclesAreNullable([invalid, employees], ["public.departments", "public.employees"]))
      .toThrow("Cyclic foreign key must be nullable");
  });

  it("backfills nullable edges after inserts", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const inserted = new Map<string, Record<string, unknown>[]>([
      ["public.departments", [{ id: 10, lead_id: null }]],
      ["public.employees", [{ id: 20, department_id: 10 }]],
    ]);
    const updated = await backfillCyclicForeignKeys({ query } as never, [departments, employees], ["public.departments", "public.employees"], inserted);
    expect(updated).toBe(1);
    expect(inserted.get("public.departments")?.[0].lead_id).toBe(20);
    expect(query).toHaveBeenCalledOnce();
  });
});
