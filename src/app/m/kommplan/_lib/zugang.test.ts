import { beforeEach, describe, expect, it, vi } from "vitest";

const zustand: { user: { sub: string; name: string; groups: string[] } | null } = { user: null };
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));
const audit = vi.hoisted(() => ({ denied: vi.fn(), login: vi.fn() }));
vi.mock("@/core/audit/server", async (orig) => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: audit.denied, auditLoginRequired: audit.login,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT ${z}`); },
}));
import { darfKommplanBearbeiten, hatKommplanZugang, requireKommplanZugang } from "./zugang";

describe("Zugang zu kommplan", () => {
  it("Zugangsgruppe, Admin-Gruppe und Suite-Admin öffnen; andere nicht", () => {
    expect(hatKommplanZugang(["iuk-kommplan"], {})).toBe(true);
    expect(hatKommplanZugang(["iuk-kommplan-bearbeiten"], {})).toBe(true);
    expect(hatKommplanZugang(["dashboard-admins"], {})).toBe(true);
    expect(hatKommplanZugang(["andere"], {})).toBe(false);
    expect(hatKommplanZugang(null, {})).toBe(false);
    expect(hatKommplanZugang([], {})).toBe(false);
  });
  it("Bearbeiten nur für Admin-Gruppe und Suite-Admin", () => {
    expect(darfKommplanBearbeiten(["iuk-kommplan"], {})).toBe(false);
    expect(darfKommplanBearbeiten(["iuk-kommplan-bearbeiten"], {})).toBe(true);
    expect(darfKommplanBearbeiten(["dashboard-admins"], {})).toBe(true);
  });
  it("SUITE_ACCESS_GROUP_KOMMPLAN ersetzt die Vorgabe", () => {
    expect(hatKommplanZugang(["plaene"], { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toBe(true);
    expect(hatKommplanZugang(["iuk-kommplan"], { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toBe(false);
  });
});

describe("requireKommplanZugang", () => {
  beforeEach(() => { zustand.user = null; audit.denied.mockClear(); audit.login.mockClear(); });
  it("ohne Sitzung → Login mit Audit; ohne Gruppe → 404 mit Audit; mit Gruppe → Viewer", async () => {
    await expect(requireKommplanZugang()).rejects.toThrow("NEXT_REDIRECT /login?callbackUrl=%2Fm%2Fkommplan");
    expect(audit.login).toHaveBeenCalledWith("kommplan");
    zustand.user = { sub: "s1", name: "Jana", groups: ["andere"] };
    await expect(requireKommplanZugang()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = { sub: "s2", name: "Kai", groups: ["iuk-kommplan"] };
    await expect(requireKommplanZugang()).resolves.toMatchObject({ sub: "s2" });
  });
});
