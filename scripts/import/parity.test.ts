import { describe, it, expect } from "vitest";
import { checkParity, assertParity } from "./parity";

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
