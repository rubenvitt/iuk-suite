import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/core/audit/server", () => ({
  auditActor: (v: { id?: string } | undefined) => (v?.id ? { kind: "user", id: v.id } : { kind: "anonymous" }),
  auditDenied: vi.fn(),
  auditEvent: vi.fn(),
}));
vi.mock("@/app/m/portal/_lib/rechte", async (original) => ({
  ...(await original<typeof import("@/app/m/portal/_lib/rechte")>()),
  setzeMitgliedschaft: vi.fn(),
}));

import { auth } from "@/core/auth";
import { auditDenied, auditEvent } from "@/core/audit/server";
import { RechteFehler, setzeMitgliedschaft } from "@/app/m/portal/_lib/rechte";
import { setzeRechtAction } from "./actions";

const authMock = vi.mocked(auth);
const setzen = vi.mocked(setzeMitgliedschaft);
const EINGABE = { personId: "u1", gruppeId: "g1", mitglied: true };

describe("setzeRechtAction", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_GROUP", "admin");
    authMock.mockReset();
    setzen.mockReset();
    vi.mocked(auditEvent).mockClear();
    vi.mocked(auditDenied).mockClear();
  });

  it("ohne Betriebsgruppe: Forbidden, nichts geschrieben, Ablehnung protokolliert", async () => {
    authMock.mockResolvedValue({ user: { id: "x", groups: ["kommplan-admin"] } } as never);
    await expect(setzeRechtAction(EINGABE)).rejects.toThrow("Forbidden");
    expect(setzen).not.toHaveBeenCalled();
    expect(auditDenied).toHaveBeenCalledWith("portal", { kind: "user", id: "x" }, "rechte");
  });

  it("eine Portal-Modulgruppe reicht nicht", async () => {
    vi.stubEnv("SUITE_ADMIN_GROUP_PORTAL", "portal-only");
    authMock.mockResolvedValue({ user: { id: "x", groups: ["portal-only"] } } as never);
    await expect(setzeRechtAction(EINGABE)).rejects.toThrow("Forbidden");
    expect(setzen).not.toHaveBeenCalled();
  });

  it("Betrieb: schreibt mit der eigenen Kennung als selbstId und protokolliert die Aufnahme", async () => {
    authMock.mockResolvedValue({ user: { id: "ich", groups: ["admin"] } } as never);
    setzen.mockResolvedValue({ geaendert: true, gruppe: { id: "g1", name: "kommplan-nutzer", anzeige: "x", ldap: false } });
    expect(await setzeRechtAction(EINGABE)).toEqual({ ok: true, geaendert: true });
    expect(setzen).toHaveBeenCalledWith({ personId: "u1", gruppeId: "g1", mitglied: true, selbstId: "ich" });
    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ module: "portal", action: "create", objectType: "gruppenmitgliedschaft", objectRef: "u1:kommplan-nutzer", result: "success" }),
      { kind: "user", id: "ich" },
    );
  });

  it("ohne Änderung kein Audit-Eintrag", async () => {
    authMock.mockResolvedValue({ user: { id: "ich", groups: ["admin"] } } as never);
    setzen.mockResolvedValue({ geaendert: false, gruppe: { id: "g1", name: "n", anzeige: "n", ldap: false } });
    await setzeRechtAction({ ...EINGABE, mitglied: false });
    expect(auditEvent).not.toHaveBeenCalled();
  });

  it("ein fachlicher Riegel kommt als Meldung zurück", async () => {
    authMock.mockResolvedValue({ user: { id: "ich", groups: ["admin"] } } as never);
    setzen.mockRejectedValue(new RechteFehler("Deine eigene Betriebsgruppe kannst du hier nicht abgeben."));
    expect(await setzeRechtAction(EINGABE)).toEqual({ ok: false, fehler: "Deine eigene Betriebsgruppe kannst du hier nicht abgeben." });
    expect(auditEvent).toHaveBeenCalledWith(expect.objectContaining({ result: "denied" }), { kind: "user", id: "ich" });
  });
});
