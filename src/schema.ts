export interface ForeignKeySchema {
  schema: string;
  table: string;
  column: string;
}

export interface ColumnSchema {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  defaultExpression: string | null;
  identity: boolean;
  generated: boolean;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  primaryKey: boolean;
  unique: boolean;
  foreignKey?: ForeignKeySchema;
  enumValues?: string[];
}

export interface TableSchema {
  schema: string;
  name: string;
  columns: ColumnSchema[];
}

export const tableId = (table: Pick<TableSchema, "schema" | "name">): string =>
  `${table.schema}.${table.name}`;
