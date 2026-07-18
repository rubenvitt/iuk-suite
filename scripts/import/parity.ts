import { createHash } from "node:crypto";

export type Row = Record<string, unknown>;

export interface ParityReport {
  ok: boolean;
  sourceCount: number;
  targetCount: number;
  missingInTarget: string[]; // checksums in source but not target
  missingInSource: string[]; // checksums in target but not source
}

// Stabile, wertkanonische Serialisierung: Schlüssel sortiert, Date→ISO,
// Arrays elementweise. Gleiche Daten → gleicher Hash, unabhängig von
// Schlüssel-/Zeilenreihenfolge.
function canon(value: unknown): unknown {
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Row).sort()) out[k] = canon((value as Row)[k]);
    return out;
  }
  return value;
}

export function rowChecksum(row: Row): string {
  return createHash("sha256").update(JSON.stringify(canon(row))).digest("hex");
}

function multiset(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = rowChecksum(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function checkParity(source: Row[], target: Row[]): ParityReport {
  const s = multiset(source), t = multiset(target);
  const missingInTarget: string[] = [];
  const missingInSource: string[] = [];
  for (const [k, n] of s) if ((t.get(k) ?? 0) < n) missingInTarget.push(k);
  for (const [k, n] of t) if ((s.get(k) ?? 0) < n) missingInSource.push(k);
  return {
    ok: missingInTarget.length === 0 && missingInSource.length === 0 && source.length === target.length,
    sourceCount: source.length,
    targetCount: target.length,
    missingInTarget,
    missingInSource,
  };
}

export function assertParity(report: ParityReport): void {
  if (report.ok) return;
  throw new Error(
    `Parity check FAILED: source=${report.sourceCount} target=${report.targetCount} ` +
      `missingInTarget=${report.missingInTarget.length} missingInSource=${report.missingInSource.length}. ` +
      `Import ABORTED — no cutover.`,
  );
}
