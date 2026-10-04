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
      if (byId.has(parent)) deps.add(parent);
    }
    dependencies.set(tableId(table), deps);
  }

  const components = stronglyConnectedComponents([...byId.keys()], dependencies);
  const componentByTable = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByTable.set(id, index)));
  const componentDependencies = components.map(() => new Set<number>());
  for (const [id, deps] of dependencies) {
    const source = componentByTable.get(id)!;
    for (const dependency of deps) {
      const target = componentByTable.get(dependency)!;
      if (source !== target) componentDependencies[source].add(target);
    }
  }

  const pending = new Set(components.map((_, index) => index));
  const orderedTables: TableSchema[] = [];
  while (pending.size) {
    const ready = [...pending].filter((index) => [...componentDependencies[index]].every((dependency) => !pending.has(dependency)));
    ready.sort((a, b) => components[a][0].localeCompare(components[b][0]));
    for (const index of ready) {
      for (const id of [...components[index]].sort()) orderedTables.push(byId.get(id)!);
      pending.delete(index);
    }
  }

  const cyclicTables = components.flatMap((component) => {
    if (component.length > 1) return component;
    const id = component[0];
    return dependencies.get(id)?.has(id) ? [id] : [];
  }).sort();
  return { orderedTables, cyclicTables };
}

function stronglyConnectedComponents(nodes: string[], edges: Map<string, Set<string>>): string[][] {
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const dependency of edges.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(dependency)!));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    components.push(component);
  };

  for (const node of nodes.sort()) if (!indexes.has(node)) visit(node);
  return components;
}
