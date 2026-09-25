#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, selectTables, tableConfig } from "./config.js";
import { appendReferenceRows, createPool, inspectSchema, loadExistingReferences } from "./database.js";
import { insertRows } from "./executor.js";
import { generateRows, seedGenerator } from "./generator.js";
import { createGenerationPlan } from "./planner.js";
import { createSummary, formatSummary, type TableResult } from "./report.js";
import { tableId } from "./schema.js";

type CommonOptions = { connection?: string; schema?: string; config?: string };
type GenerateOptions = CommonOptions & { rows?: string; seed: string; execute: boolean; tables?: string };

const program = new Command()
  .name("db-autofill")
  .description("Generate PostgreSQL test data from schema metadata")
  .version("0.1.0");

const withDatabaseOptions = (command: Command): Command => command
  .option("-c, --connection <url>", "PostgreSQL URL (or DATABASE_URL)")
  .option("-s, --schema <name>", "database schema (default: config or public)")
  .option("--config <path>", "JSON or JavaScript configuration file");

withDatabaseOptions(program.command("inspect").description("Print detected tables and columns"))
  .action(async (options: CommonOptions) => withPool(options, async (pool) => {
    const config = await loadConfig(options.config);
    const tables = await inspectSchema(pool, options.schema ?? config.schema ?? "public");
    console.log(JSON.stringify(tables, null, 2));
  }));

withDatabaseOptions(program.command("plan").description("Print table insertion order"))
  .action(async (options: CommonOptions) => withPool(options, async (pool) => {
    const config = await loadConfig(options.config);
    const plan = createGenerationPlan(selectTables(await inspectSchema(pool, options.schema ?? config.schema ?? "public"), config));
    console.log("Insertion order:");
    plan.orderedTables.forEach((table, index) => console.log(`${index + 1}. ${tableId(table)}`));
    if (plan.cyclicTables.length) console.log(`Unsupported cycles: ${plan.cyclicTables.join(", ")}`);
  }));

withDatabaseOptions(program.command("generate").description("Preview or insert generated rows")
  .option("-n, --rows <count>", "rows per table (overrides config)")
  .option("--seed <number>", "repeatable random seed", "42")
  .option("-t, --tables <names>", "comma-separated table names")
  .option("--execute", "commit generated rows (default is preview only)", false))
  .action(async (options: GenerateOptions) => withPool(options, async (pool) => {
    const startedAt = Date.now();
    const config = await loadConfig(options.config);
    const defaultCount = options.rows ? positiveInteger(options.rows, "rows") : config.defaultRows ?? 10;
    seedGenerator(positiveInteger(options.seed, "seed", true));
    const schema = options.schema ?? config.schema ?? "public";
    const inspected = await inspectSchema(pool, schema);
    const plan = createGenerationPlan(selectTables(inspected, config, options.tables));
    if (plan.cyclicTables.length) throw new Error(`Cyclic foreign keys are not supported yet: ${plan.cyclicTables.join(", ")}`);

    if (!options.execute) {
      const references = previewReferences(inspected, defaultCount);
      const generated = plan.orderedTables.map((table) => {
        const current = tableConfig(config, table);
        return { table, rows: generateRows(table, options.rows ? defaultCount : current.rows ?? defaultCount, references, current.columns) };
      });
      console.log(JSON.stringify(generated.map(({ table, rows }) => ({ table: tableId(table), rows })), null, 2));
      const results = generated.map(({ table, rows }) => ({ table: tableId(table), rows: rows.length }));
      console.log(formatSummary(createSummary("preview", results, startedAt)));
      console.log("Preview only. Add --execute to insert these rows.");
      return;
    }

    const client = await pool.connect();
    const results: TableResult[] = [];
    try {
      await client.query("BEGIN");
      const references = await loadExistingReferences(client as never, plan.orderedTables, defaultCount);
      for (const table of plan.orderedTables) {
        const current = tableConfig(config, table);
        const count = options.rows ? defaultCount : current.rows ?? defaultCount;
        const rows = generateRows(table, count, references, current.columns);
        const inserted = await insertRows(client, table, rows);
        appendReferenceRows(references, table, inserted);
        results.push({ table: tableId(table), rows: inserted.length });
        console.log(`${tableId(table)}: inserted ${inserted.length}`);
      }
      await client.query("COMMIT");
      console.log(formatSummary(createSummary("execute", results, startedAt)));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }));

async function withPool(options: CommonOptions, action: (pool: ReturnType<typeof createPool>) => Promise<void>): Promise<void> {
  const connection = options.connection ?? process.env.DATABASE_URL;
  if (!connection) throw new Error("Provide --connection or set DATABASE_URL");
  const pool = createPool(connection);
  try { await action(pool); } finally { await pool.end(); }
}

function positiveInteger(value: string, name: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed < 1)) throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  return parsed;
}

function previewReferences(tables: Awaited<ReturnType<typeof inspectSchema>>, count: number): Map<string, unknown[]> {
  const references = new Map<string, unknown[]>();
  for (const table of tables) {
    for (const column of table.columns) {
      references.set(`${tableId(table)}.${column.name}`, Array.from({ length: count }, (_, index) => `<${tableId(table)}.${column.name}:${index + 1}>`));
    }
  }
  return references;
}

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
