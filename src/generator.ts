import { faker } from "@faker-js/faker";
import type { ColumnSchema, TableSchema } from "./schema.js";
import { tableId } from "./schema.js";

const semanticGenerators: Array<[RegExp, () => unknown]> = [
  [/^e-?mail$|_email$/i, () => faker.internet.email()],
  [/first_?name/i, () => faker.person.firstName()],
  [/last_?name/i, () => faker.person.lastName()],
  [/full_?name|^name$/i, () => faker.person.fullName()],
  [/phone/i, () => faker.phone.number()],
  [/city/i, () => faker.location.city()],
  [/address/i, () => faker.location.streetAddress()],
  [/company/i, () => faker.company.name()],
  [/^url$|_url$/i, () => faker.internet.url()],
];

export function seedGenerator(seed: number): void {
  faker.seed(seed);
}

export function shouldOmitColumn(column: ColumnSchema): boolean {
  return column.identity || column.generated || column.defaultExpression !== null;
}

export function generateValue(column: ColumnSchema, index: number): unknown {
  if (column.enumValues?.length) return faker.helpers.arrayElement(column.enumValues);
  for (const [pattern, generate] of semanticGenerators) {
    if (pattern.test(column.name)) {
      const value = String(generate());
      return column.unique ? uniqueSemanticValue(column, value, index) : fitString(value, column.maxLength);
    }
  }
  if (column.unique) return uniqueValue(column, index);

  switch (column.dataType) {
    case "smallint": return faker.number.int({ min: -30_000, max: 30_000 });
    case "integer": return faker.number.int({ min: 1, max: 2_000_000_000 });
    case "bigint": return String(faker.number.int({ min: 1, max: 2_000_000_000 }));
    case "numeric":
    case "decimal": return faker.number.float({ min: 0, max: 100_000, fractionDigits: column.numericScale ?? 2 });
    case "real":
    case "double precision": return faker.number.float({ min: -100_000, max: 100_000 });
    case "boolean": return faker.datatype.boolean();
    case "date": return faker.date.recent({ days: 365 }).toISOString().slice(0, 10);
    case "timestamp without time zone":
    case "timestamp with time zone": return faker.date.recent({ days: 365 });
    case "uuid": return faker.string.uuid();
    case "json":
    case "jsonb": return { test: true, index };
    case "character":
    case "character varying":
    case "text": return fitString(faker.lorem.words({ min: 1, max: 5 }), column.maxLength);
    default:
      if (column.nullable) return null;
      throw new Error(`No generator for required column ${column.name} (${column.dataType})`);
  }
}

function uniqueValue(column: ColumnSchema, index: number): unknown {
  if (["smallint", "integer", "bigint", "numeric", "decimal"].includes(column.dataType)) return index + 1;
  if (column.dataType === "uuid") return faker.string.uuid();
  return fitString(`${column.name}_${index + 1}`, column.maxLength);
}

function uniqueSemanticValue(column: ColumnSchema, value: string, index: number): string {
  const suffix = `-${index + 1}`;
  if (/email/i.test(column.name) && value.includes("@")) {
    const [local, domain] = value.split("@", 2);
    return fitString(`${local}${suffix}@${domain}`, column.maxLength);
  }
  const available = column.maxLength === null ? value.length : Math.max(0, column.maxLength - suffix.length);
  return `${value.slice(0, available)}${suffix}`;
}

function fitString(value: string, maxLength: number | null): string {
  return maxLength === null ? value : value.slice(0, maxLength);
}

export type ReferenceValues = ReadonlyMap<string, readonly unknown[]>;
export interface ColumnRule { value?: unknown; values?: unknown[] }

export function generateRows(
  table: TableSchema,
  count: number,
  references: ReferenceValues = new Map(),
  rules: Readonly<Record<string, ColumnRule>> = {},
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    Object.fromEntries(table.columns.filter((column) =>
      !column.identity && !column.generated && (column.defaultExpression === null || rules[column.name] !== undefined))
      .map((column) => {
        const key = `${tableId(table)}.${column.name}`;
        const existingCount = column.unique
          ? Number(references.get(`${key}#count`)?.[0] ?? references.get(key)?.length ?? 0)
          : 0;
        return [column.name, generateColumnValue(column, index + existingCount, references, rules[column.name])];
      })),
  );
}

function generateColumnValue(column: ColumnSchema, index: number, references: ReferenceValues, rule?: ColumnRule): unknown {
  if (rule?.values) return rule.values[index % rule.values.length];
  if (rule && "value" in rule) return rule.value;
  if (!column.foreignKey) return generateValue(column, index);
  const key = `${column.foreignKey.schema}.${column.foreignKey.table}.${column.foreignKey.column}`;
  const values = references.get(key) ?? [];
  if (values.length > 0) return values[index % values.length];
  if (column.nullable) return null;
  throw new Error(`No referenced values available for required column ${column.name} -> ${key}`);
}
