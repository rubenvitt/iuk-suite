import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

/*
 * Dieselbe leichte Bauform wie `serverwartung/page.test.tsx`: die Seite liefert einen Elementbaum,
 * keinen DOM. Die Quellen sind gemockt — welche Zeilen ein Modul herausgibt, prüfen die Tests neben
 * `lagerbuch/_lib/faelligkeiten.ts` und `radio/_lib/faelligkeiten.ts`.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/core/auth/guards", () => ({ canAdminModule: vi.fn(async () => false) }));
vi.mock("@/core/audit/server", () => ({ auditActor: vi.fn(() => ({ kind: "anonymous" })), auditDenied: vi.fn() }));
vi.mock("@/app/m/lagerbuch/_lib/faelligkeiten", () => ({
  darfLagerbuchFaelligkeitenSehen: (g: string[] | null) => !!g?.includes("lager-admin"),
  lagerbuchFaelligkeiten: () => [{
    id: "o2:1", art: "Sauerstoff", titel: "Flasche 1", wo: "RTW 1", zustand: "noch 20 %, wechseln",
    dringlichkeit: "ueberfaellig", sortierung: "", pfad: "/verwaltung/sauerstoff/1",
  }],
}));
vi.mock("@/app/m/radio/_lib/faelligkeiten", () => ({
  darfRadioFaelligkeitenSehen: (g: string[] | null) => !!g?.includes("funk-admin"),
  radioFaelligkeiten: () => [],
}));

import { auth } from "@/core/auth";
import { canAdminModule } from "@/core/auth/guards";
import { auditDenied } from "@/core/audit/server";
import FaelligkeitenPage from "@/app/m/portal/faelligkeiten/page";
import { FaelligkeitenJetztSenden } from "@/app/m/portal/_ui/FaelligkeitenJetztSenden";
import { FaelligkeitenListe } from "@/app/m/portal/_ui/FaelligkeitenListe";
import { NtfyAnleitung } from "@/app/m/portal/_ui/ServerwartungAnleitung";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

const authMock = vi.mocked(auth);

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

function mitGruppen(groups: string[] | null) {
  authMock.mockResolvedValue((groups ? { user: { groups } } : null) as never);
}

describe("Seite „Was steht an“", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.mocked(auditDenied).mockClear();
    vi.mocked(canAdminModule).mockResolvedValue(false);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("zeigt nur die Module, die die Person verwaltet — mit Rückweg", async () => {
    mitGruppen(["lager-admin"]);
    const baum = flatten(await FaelligkeitenPage());
    const kopf = baum.find((el) => el.type === Seitenkopf)!;
    expect((kopf.props as { titel: string }).titel).toBe("Was steht an");
    expect((kopf.props as { zurueck?: { href: string } }).zurueck?.href).toBe("/");
    const liste = baum.find((el) => el.type === FaelligkeitenListe)!;
    const gruppen = (liste.props as { gruppen: { modul: string; eintraege: unknown[] }[] }).gruppen;
    expect(gruppen.map((g) => g.modul)).toEqual(["lagerbuch"]);
    expect(gruppen[0].eintraege).toHaveLength(1);
    expect(baum.some((el) => el.type === NtfyAnleitung)).toBe(false);
  });

  it.each([
    ["anonym", null],
    ["Suite-Betrieb ohne Modulrecht", ["admin"]],
  ])("ist %s ein 404 mit Audit-Zeile", async (_fall, groups) => {
    mitGruppen(groups);
    await expect(FaelligkeitenPage()).rejects.toThrow();
    expect(auditDenied).toHaveBeenCalledTimes(1);
  });

  it("mit eingerichtetem Thema: Anleitung für alle, „Jetzt senden“ nur für den Betrieb und nur mit Token", async () => {
    vi.stubEnv("SUITE_FAELLIG_NTFY_URL", "https://ntfy.example.org/beispielthema");
    mitGruppen(["funk-admin"]);
    let baum = flatten(await FaelligkeitenPage());
    const insel = baum.find((el) => el.type === NtfyAnleitung)!;
    expect((insel.props as { abo: { thema: string } }).abo.thema).toBe("beispielthema");
    expect(baum.some((el) => el.type === FaelligkeitenJetztSenden)).toBe(false);

    vi.mocked(canAdminModule).mockResolvedValue(true);
    baum = flatten(await FaelligkeitenPage());
    expect(baum.some((el) => el.type === FaelligkeitenJetztSenden)).toBe(false);

    vi.stubEnv("SUITE_FAELLIG_NTFY_TOKEN", "tk_beispielbeispielbeispielbeis");
    baum = flatten(await FaelligkeitenPage());
    expect(baum.some((el) => el.type === FaelligkeitenJetztSenden)).toBe(true);
  });
});
