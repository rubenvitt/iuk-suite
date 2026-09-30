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
const kopf = vi.hoisted(() => ({ host: "kommplan.localtest.me" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: kopf.host }) }));
import { bearbeiterAus, darfKommplanBearbeiten, hatKommplanZugang, requireKommplanBearbeitenAktion, requireKommplanZugang } from "./zugang";

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

describe("Bearbeiten-Riegel für Server Actions", () => {
  beforeEach(() => { kopf.host = "kommplan.localtest.me"; audit.denied.mockReset(); audit.login.mockReset(); });
  it("Admin-Gruppe darf, Zugangsgruppe nicht, ohne Anmeldung nicht, fremder Host nicht — je mit Audit", async () => {
    zustand.user = { sub: "u1", name: "Jana", groups: ["iuk-kommplan-bearbeiten"] };
    await expect(requireKommplanBearbeitenAktion()).resolves.toMatchObject({ sub: "u1" });
    zustand.user = { sub: "u2", name: "Ole", groups: ["iuk-kommplan"] };
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = null;
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.login).toHaveBeenCalledTimes(1);
    zustand.user = { sub: "u1", name: "Jana", groups: ["iuk-kommplan-bearbeiten"] };
    kopf.host = "feedback.localtest.me";
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(2);
  });
  it("Bearbeiter: Kennung aus dem Audit-Akteur, Name mit Rückfall", () => {
    expect(bearbeiterAus({ sub: "u1", name: " Jana ", groups: [] } as never)).toEqual({ nutzer: "u1", name: "Jana" });
    expect(bearbeiterAus({ id: "u2", email: "ole@x.de", groups: [] } as never)).toEqual({ nutzer: "u2", name: "ole@x.de" });
  });
});
