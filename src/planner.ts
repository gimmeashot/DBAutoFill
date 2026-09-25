import type { TableSchema } from "./schema.js";
import { tableId } from "./schema.js";

export interface GenerationPlan {
  orderedTables: TableSchema[];
  cyclicTables: string[];
}

export function createGenerationPlan(tables: TableSchema[]): GenerationPlan {
  const byId = new Map(tables.map((table) => [tableId(table), table]));
  const dependencies = new Map<string, Set<string>>();
  for (const table of tables) {
    const deps = new Set<string>();
    for (const column of table.columns) {
      if (!column.foreignKey) continue;
      const parent = `${column.foreignKey.schema}.${column.foreignKey.table}`;
      if (parent !== tableId(table) && byId.has(parent)) deps.add(parent);
    }
    dependencies.set(tableId(table), deps);
  }

  const orderedTables: TableSchema[] = [];
  const pending = new Set(byId.keys());
  while (pending.size > 0) {
    const ready = [...pending].filter((id) =>
      [...(dependencies.get(id) ?? [])].every((dependency) => !pending.has(dependency)),
    );
    if (ready.length === 0) break;
    ready.sort();
    for (const id of ready) {
      orderedTables.push(byId.get(id)!);
      pending.delete(id);
    }
  }

  return { orderedTables, cyclicTables: [...pending].sort() };
}
