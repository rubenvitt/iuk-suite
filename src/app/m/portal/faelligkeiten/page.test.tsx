import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

/*
 * Dieselbe leichte Bauform wie `serverwartung/page.test.tsx`: die Seite liefert einen Elementbaum,
 * keinen DOM. Die Quellen sind gemockt — welche Zeilen ein Modul herausgibt, prüfen die Tests neben
 * `lagerbuch/_lib/faelligkeiten.ts` und `radio/_lib/faelligkeiten.ts`.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/portal/_lib/faelligkeiten/abos", () => ({ aboVon: vi.fn(() => null), vermerkeGruppen: vi.fn() }));
vi.mock("@/core/audit/server", () => ({ auditActor: vi.fn(() => ({ kind: "anonymous" })), auditDenied: vi.fn() }));
vi.mock("@/app/m/lagerbuch/_lib/faelligkeiten", () => ({
  LAGERBUCH_FAELLIGKEITS_ARTEN: ["Verfall", "Sauerstoff"],
  darfLagerbuchFaelligkeitenSehen: (g: string[] | null) => !!g?.includes("lager-admin"),
  lagerbuchFaelligkeiten: () => [{
    id: "o2:1", art: "Sauerstoff", titel: "Flasche 1", wo: "RTW 1", zustand: "noch 20 %, wechseln",
    dringlichkeit: "ueberfaellig", sortierung: "", pfad: "/verwaltung/sauerstoff/1",
  }],
}));
vi.mock("@/app/m/radio/_lib/faelligkeiten", () => ({
  RADIO_FAELLIGKEITS_ARTEN: ["Ausleihe"],
  darfRadioFaelligkeitenSehen: (g: string[] | null) => !!g?.includes("funk-admin"),
  radioFaelligkeiten: () => [],
}));

import { auth } from "@/core/auth";
import { aboVon, vermerkeGruppen } from "@/app/m/portal/_lib/faelligkeiten/abos";
import { auditDenied } from "@/core/audit/server";
import FaelligkeitenPage from "@/app/m/portal/faelligkeiten/page";
import { FaelligkeitenAuswahl, FaelligkeitenEinrichten, FaelligkeitenProbe } from "@/app/m/portal/_ui/FaelligkeitenAbo";
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
  authMock.mockResolvedValue((groups ? { user: { id: "person-1", groups } } : null) as never);
}

describe("Seite „Was steht an“", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.mocked(auditDenied).mockClear();
    vi.mocked(aboVon).mockReset().mockReturnValue(null);
    vi.mocked(vermerkeGruppen).mockClear();
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

  it("ohne eingerichteten Versand kein Abo-Abschnitt", async () => {
    vi.stubEnv("SUITE_FAELLIG_NTFY_SERVER", "https://ntfy.example.org");
    mitGruppen(["funk-admin"]);
    const baum = flatten(await FaelligkeitenPage());
    expect(baum.some((el) => el.type === FaelligkeitenEinrichten)).toBe(false);
    expect(aboVon).not.toHaveBeenCalled();
  });

  it("mit Versand: erst Einrichten, danach Auswahl, Anleitung für das EIGENE Thema und Probe", async () => {
    vi.stubEnv("SUITE_FAELLIG_NTFY_SERVER", "https://ntfy.example.org");
    vi.stubEnv("SUITE_FAELLIG_NTFY_TOKEN", "tk_beispielbeispielbeispielbeis");
    mitGruppen(["funk-admin"]);
    let baum = flatten(await FaelligkeitenPage());
    expect(baum.some((el) => el.type === FaelligkeitenEinrichten)).toBe(true);
    expect(baum.some((el) => el.type === NtfyAnleitung)).toBe(false);
    expect(aboVon).toHaveBeenCalledWith("person-1");

    vi.mocked(aboVon).mockReturnValue({
      personId: "person-1", thema: "iuk-faellig-beispielbeispielbeis", push: true, abgewaehlt: ["radio:Ausleihe"],
      gruppen: [], gesendeteWoche: null, erstelltAm: new Date(0),
    });
    baum = flatten(await FaelligkeitenPage());
    expect(baum.some((el) => el.type === FaelligkeitenEinrichten)).toBe(false);
    expect((baum.find((el) => el.type === NtfyAnleitung)!.props as { abo: { thema: string } }).abo.thema).toBe("iuk-faellig-beispielbeispielbeis");
    const auswahl = baum.find((el) => el.type === FaelligkeitenAuswahl)!.props as { abgewaehlt: string[]; module: { modul: string }[] };
    expect(auswahl.abgewaehlt).toEqual(["radio:Ausleihe"]);
    expect(auswahl.module.map((m) => m.modul)).toEqual(["radio"]);
    expect(baum.some((el) => el.type === FaelligkeitenProbe)).toBe(true);
    expect(vermerkeGruppen).toHaveBeenCalledWith(expect.objectContaining({ personId: "person-1" }), ["funk-admin"]);
  });
});
