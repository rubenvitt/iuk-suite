import { beforeEach, describe, expect, it, vi } from "vitest";
import { hatEinsatzbuchZugang } from "./zugang";

const zustand: { host: string; user: { sub: string; name: string; groups: string[] } | null } = { host: "einsatzbuch.localtest.me", user: null };
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: zustand.host }) }));
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));
const audit = vi.hoisted(() => ({ denied: vi.fn(), login: vi.fn() }));
vi.mock("@/core/audit/server", async orig => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: audit.denied, auditLoginRequired: audit.login,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT ${z}`); },
}));

describe("hatEinsatzbuchZugang", () => {
  it("die Zugangsgruppe öffnet das Modul", () => {
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], {})).toBe(true);
  });
  it("ohne Gruppe, anonym oder mit leerer Liste: kein Zugang", () => {
    expect(hatEinsatzbuchZugang(["andere"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(null, {})).toBe(false);
    expect(hatEinsatzbuchZugang([], {})).toBe(false);
  });
  it("der Suite-Admin allein öffnet das Modul NICHT (hier liegt die Schlüsselfreigabe)", () => {
    expect(hatEinsatzbuchZugang(["dashboard-admins"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(["chef"], { ADMIN_GROUP: "chef" })).toBe(false);
  });
  it("SUITE_ACCESS_GROUP_EINSATZBUCH ersetzt die Vorgabe", () => {
    expect(hatEinsatzbuchZugang(["eb-leitung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(true);
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(false);
  });
});

describe("Riegel mit Audit-Zweigen", () => {
  beforeEach(() => { zustand.host = "einsatzbuch.localtest.me"; zustand.user = null; audit.denied.mockClear(); audit.login.mockClear(); });
  const mitGruppe = { sub: "s1", name: "Jana", groups: ["einsatzbuch-verwaltung"] };
  const admin = { sub: "s2", name: "Chef", groups: ["dashboard-admins"] };

  it("requireEinsatzbuchZugang: ohne Sitzung → Login mit Audit, ohne Gruppe → 404 mit Audit", async () => {
    const { requireEinsatzbuchZugang } = await import("./zugang");
    await expect(requireEinsatzbuchZugang()).rejects.toThrow("NEXT_REDIRECT");
    expect(audit.login).toHaveBeenCalledWith("einsatzbuch");
    zustand.user = admin;
    await expect(requireEinsatzbuchZugang()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = mitGruppe;
    await expect(requireEinsatzbuchZugang()).resolves.toMatchObject({ sub: "s1" });
  });
  it("requireEinsatzbuchAktion: fremder Host, ohne Sitzung, ohne Gruppe → Forbidden mit Audit", async () => {
    const { requireEinsatzbuchAktion } = await import("./zugang");
    zustand.user = mitGruppe; zustand.host = "feedback.localtest.me";
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.host = "einsatzbuch.localtest.me"; zustand.user = null;
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.login).toHaveBeenCalledTimes(1);
    zustand.user = admin;
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(2);
    zustand.user = mitGruppe;
    await expect(requireEinsatzbuchAktion()).resolves.toMatchObject({ sub: "s1" });
  });
  it("einsatzbuchZugang: 401 ohne Sitzung, 403 ohne Gruppe, ok mit Gruppe", async () => {
    const { einsatzbuchZugang } = await import("./zugang");
    const ohne = await einsatzbuchZugang();
    expect(ohne.ok ? 0 : ohne.response.status).toBe(401);
    zustand.user = admin;
    const fremd = await einsatzbuchZugang();
    expect(fremd.ok ? 0 : fremd.response.status).toBe(403);
    zustand.user = mitGruppe;
    expect((await einsatzbuchZugang()).ok).toBe(true);
  });
});
