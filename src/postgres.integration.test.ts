import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendReferenceRows, createPool, inspectSchema, loadExistingReferences } from "./database.js";
import { insertRows } from "./executor.js";
import { generateRows, seedGenerator } from "./generator.js";
import { createGenerationPlan } from "./planner.js";

const connection = process.env.TEST_DATABASE_URL;
const integration = connection ? describe : describe.skip;

integration("PostgreSQL integration", () => {
  const pool = connection ? createPool(connection) : undefined;

  beforeAll(async () => {
    await pool!.query("TRUNCATE orders, users RESTART IDENTITY CASCADE");
  });

  afterAll(async () => pool?.end());

  it("inspects, generates and inserts related rows", async () => {
    seedGenerator(42);
    const plan = createGenerationPlan(await inspectSchema(pool!, "public"));
    expect(plan.orderedTables.map((table) => table.name)).toEqual(["users", "orders"]);

    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const references = await loadExistingReferences(client as never, plan.orderedTables, 3);
      for (const table of plan.orderedTables) {
        const inserted = await insertRows(client, table, generateRows(table, 3, references));
        appendReferenceRows(references, table, inserted);
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const result = await pool!.query("SELECT count(*)::int AS count FROM orders o JOIN users u ON u.id = o.user_id");
    expect(result.rows[0].count).toBe(3);
  });
});
