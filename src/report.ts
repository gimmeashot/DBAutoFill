export interface TableResult {
  table: string;
  rows: number;
}

export interface GenerationSummary {
  mode: "preview" | "execute";
  tables: number;
  rows: number;
  durationMs: number;
  results: TableResult[];
}

export function createSummary(
  mode: GenerationSummary["mode"],
  results: TableResult[],
  startedAt: number,
): GenerationSummary {
  return {
    mode,
    tables: results.length,
    rows: results.reduce((total, result) => total + result.rows, 0),
    durationMs: Date.now() - startedAt,
    results,
  };
}

export function formatSummary(summary: GenerationSummary): string {
  const action = summary.mode === "execute" ? "Inserted" : "Prepared";
  return `${action} ${summary.rows} rows for ${summary.tables} tables in ${summary.durationMs} ms.`;
}
