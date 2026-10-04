import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendReferenceRows, createPool, inspectSchema, loadExistingReferences } from "./database.js";
import { backfillCyclicForeignKeys, insertRows } from "./executor.js";
import { generateRows, seedGenerator } from "./generator.js";
import { createGenerationPlan } from "./planner.js";

const connection = process.env.TEST_DATABASE_URL;
const integration = connection ? describe : describe.skip;

integration("PostgreSQL integration", () => {
  const pool = connection ? createPool(connection) : undefined;

  beforeAll(async () => {
    await pool!.query("TRUNCATE orders, users, tenant_settings, tenants, departments, employees RESTART IDENTITY CASCADE");
  });

  afterAll(async () => pool?.end());

  it("inspects, generates and inserts related rows", async () => {
    seedGenerator(42);
    const plan = createGenerationPlan(await inspectSchema(pool!, "public"));
    const order = plan.orderedTables.map((table) => table.name);
    expect(order.indexOf("users")).toBeLessThan(order.indexOf("orders"));
    expect(order.indexOf("tenants")).toBeLessThan(order.indexOf("tenant_settings"));
    expect(plan.cyclicTables).toEqual(["public.departments", "public.employees"]);

    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const references = await loadExistingReferences(client as never, plan.orderedTables, 3);
      const insertedByTable = new Map<string, Record<string, unknown>[]>();
      for (const table of plan.orderedTables) {
        const inserted = await insertRows(client, table, generateRows(table, 3, references));
        insertedByTable.set(`${table.schema}.${table.name}`, inserted);
        appendReferenceRows(references, table, inserted);
      }
      await backfillCyclicForeignKeys(client, plan.orderedTables, plan.cyclicTables, insertedByTable);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const result = await pool!.query("SELECT count(*)::int AS count FROM orders o JOIN users u ON u.id = o.user_id");
    expect(result.rows[0].count).toBe(3);
    const composite = await pool!.query("SELECT count(*)::int AS count FROM tenant_settings s JOIN tenants t ON t.id = s.tenant_id AND t.region_code = s.region_code");
    expect(composite.rows[0].count).toBe(3);
    const cyclic = await pool!.query("SELECT count(*)::int AS count FROM departments d JOIN employees e ON e.id = d.lead_employee_id AND e.department_id = d.id");
    expect(cyclic.rows[0].count).toBe(3);
  });
});
