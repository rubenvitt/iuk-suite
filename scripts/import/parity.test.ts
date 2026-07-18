import { describe, it, expect } from "vitest";
import { checkParity, assertParity, rowChecksum } from "./parity";

const a = { id: "1", name: "A", tags: ["x", "y"], flag: true };
const b = { id: "2", name: "B", tags: [], flag: false };

describe("checkParity", () => {
  it("passes when source and target hold the same rows (order-independent)", () => {
    const r = checkParity([a, b], [b, a]);
    expect(r.ok).toBe(true);
    expect(r.sourceCount).toBe(2);
    expect(r.targetCount).toBe(2);
  });

  it("fails and lists the row missing in target", () => {
    const r = checkParity([a, b], [a]);
    expect(r.ok).toBe(false);
    expect(r.missingInTarget).toHaveLength(1);
  });

  it("assertParity throws on mismatch with a report in the message", () => {
    const r = checkParity([a, b], [a]);
    expect(() => assertParity(r)).toThrow(/parity/i);
  });

  it("assertParity is silent when ok", () => {
    expect(() => assertParity(checkParity([a], [a]))).not.toThrow();
  });
});

describe("rowChecksum canonicalization", () => {
  it("is independent of key order within a row", () => {
    expect(rowChecksum({ id: "1", name: "A" })).toBe(rowChecksum({ name: "A", id: "1" }));
  });
  it("hashes two Date instances for the same instant equally", () => {
    const iso = "2026-01-02T03:04:05.000Z";
    expect(rowChecksum({ when: new Date(iso) })).toBe(rowChecksum({ when: new Date(iso) }));
  });
  it("distinguishes an explicit undefined field from an absent field", () => {
    expect(rowChecksum({ id: "1", extra: undefined })).not.toBe(rowChecksum({ id: "1" }));
  });
});

describe("checkParity — multiset & symmetry", () => {
  it("detects a row present in target but missing in source", () => {
    const r = checkParity([a], [a, b]);
    expect(r.ok).toBe(false);
    expect(r.missingInSource).toHaveLength(1);
  });
  it("counts duplicates as a multiset (2 in source, 1 in target)", () => {
    const r = checkParity([a, a], [a]);
    expect(r.ok).toBe(false);
    expect(r.missingInTarget).toHaveLength(1);
  });
});
