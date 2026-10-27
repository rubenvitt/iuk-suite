import { beforeEach, describe, expect, it, vi } from "vitest";

const auditDenied = vi.fn();
vi.mock("@/core/audit/server", () => ({ auditDenied: (...a: unknown[]) => auditDenied(...a) }));

const { ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE, abholungAbgelehnt, abholungDrosselZuruecksetzen } = await import("./ablehnung");

describe("abholungAbgelehnt", () => {
  beforeEach(() => {
    auditDenied.mockReset();
    abholungDrosselZuruecksetzen();
  });

  it("schreibt ein widerrufener Monitor eine Stunde lang höchstens max + 1 Zeilen", () => {
    for (let i = 0; i < 60; i++) abholungAbgelehnt();
    expect(auditDenied).toHaveBeenCalledTimes(ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE + 1);
    expect(auditDenied.mock.calls.at(-1)).toEqual(["lagemonitor", { kind: "anonymous" }, "access_throttled"]);
    expect(auditDenied.mock.calls[0]).toEqual(["lagemonitor"]);
  });
});
