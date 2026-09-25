import { describe, expect, it, vi } from "vitest";
import { createSummary, formatSummary } from "./report.js";

describe("generation report", () => {
  it("counts rows and formats the execution result", () => {
    vi.spyOn(Date, "now").mockReturnValue(1250);
    const summary = createSummary("execute", [{ table: "public.users", rows: 3 }, { table: "public.orders", rows: 5 }], 1000);
    expect(summary).toMatchObject({ tables: 2, rows: 8, durationMs: 250 });
    expect(formatSummary(summary)).toBe("Inserted 8 rows for 2 tables in 250 ms.");
    vi.restoreAllMocks();
  });
});
