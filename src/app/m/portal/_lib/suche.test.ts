import { existsSync, readdirSync } from "node:fs";
import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import type { SuiteSuche } from "@/core/suche";
import { SUCHMODULE, sucheUeberall } from "./suche";

const treffer = (id: string) => ({ id, art: "Ding", titel: `Titel ${id}`, merkmale: [], pfad: `/x/${id}` });
const url = (m: string) => `https://${m}.example`;

describe("sucheUeberall", () => {
  it("ein Modul, das `null` sagt, fehlt ganz; eines ohne Treffer ebenso", () => {
    const ergebnis = sucheUeberall("abc", null, [
      { modul: "radio", suche: () => null },
      { modul: "fahrzeuge", suche: () => ({ treffer: [], mehr: false }) },
      { modul: "lagerbuch", suche: () => ({ treffer: [treffer("1")], mehr: true }) },
    ], url);
    expect(ergebnis).toEqual([
      {
        modul: "lagerbuch", titel: "Lagerbuch", icon: "warehouse", zustand: "treffer", mehr: true,
        treffer: [{ id: "1", art: "Ding", titel: "Titel 1", merkmale: [], href: "https://lagerbuch.example/x/1" }],
      },
    ]);
  });

  it("reicht Begriff und Sitzung unverändert an jedes Modul — die Rechteprüfung ist dort", () => {
    const suche = vi.fn<SuiteSuche>(() => null);
    const sitzung = { user: { id: "u", groups: ["g"] }, expires: "x" } as Session;
    sucheUeberall("UE-RK 831", sitzung, [{ modul: "fahrzeuge", suche }], url);
    expect(suche).toHaveBeenCalledWith("UE-RK 831", sitzung);
  });

  it("ein Modul, das wirft, steht als Fehler da; die übrigen Treffer bleiben", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ergebnis = sucheUeberall("abc", null, [
      { modul: "radio", suche: () => { throw new Error("db weg"); } },
      { modul: "fahrzeuge", suche: () => ({ treffer: [treffer("2")], mehr: false }) },
    ], url);
    expect(ergebnis.map((e) => [e.modul, e.zustand])).toEqual([["radio", "fehler"], ["fahrzeuge", "treffer"]]);
  });

  it("ohne erreichbare Adresse fehlt das Modul — ein Treffer ohne Link führte nirgendwohin", () => {
    const suche = vi.fn<SuiteSuche>(() => ({ treffer: [treffer("3")], mehr: false }));
    expect(sucheUeberall("abc", null, [{ modul: "radio", suche }], () => null)).toEqual([]);
    expect(suche).not.toHaveBeenCalled();
  });
});

describe("SUCHMODULE", () => {
  it("jedes Modul mit `_lib/suiteSuche.ts` ist eingetragen, und nur diese", () => {
    const mitSuche = readdirSync("src/app/m").filter((m) => existsSync(`src/app/m/${m}/_lib/suiteSuche.ts`)).sort();
    expect(SUCHMODULE.map((s) => s.modul).sort()).toEqual(mitSuche);
  });

  it("Einsatzbuch (verschlüsselt) und Helfer (Personaldaten) bleiben draußen", () => {
    expect(SUCHMODULE.map((s) => s.modul)).not.toContain("einsatzbuch");
    expect(SUCHMODULE.map((s) => s.modul)).not.toContain("helfer");
  });
});
