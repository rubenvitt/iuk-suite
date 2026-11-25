import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planeAbgleich, wendeAbgleichAn } from "./abgleich";
import { bereitgestellteHelfer, helferFuerLifeline, helferFuerSchichtplanung } from "./bereitstellung";
import { listeHelfer, setzeFreigabe } from "./daten";
import { STANDARD_FILTER } from "./filter";
import { testDb } from "./testDb";

function wende(db: ReturnType<typeof testDb>, quelle: "demo" | "hiorg") {
  const personen = ["a", "b"].map((id) => ({
    quellId: id, vorname: `V${id}`, nachname: `N${id}`, status: "aktiv", gesperrt: false, austritt: null,
    gruppen: ["Bereitschaft"], qualifikationen: [{ liste: "med. Qualifikation", name: "Rettungssanitäter", kurz: "RS" }],
    fahrerlaubnis: ["c1", "B"],
  }));
  wendeAbgleichAn(db, planeAbgleich({ personen, unlesbar: 0 }, [], STANDARD_FILTER, "2026-10-20", quelle), { neueFreigeben: true, von: { name: "T", sub: "t" } });
}

describe("bereitgestellteHelfer — was das Modul anderen Modulen herausgibt", () => {
  it("genau diese Felder, keine HiOrg-Kennung, keine Gruppen, kein Status", () => {
    const db = testDb();
    wende(db, "hiorg");
    const b = bereitgestellteHelfer(db);
    expect(b.stand).not.toBeNull();
    expect(b.helfer).toHaveLength(2);
    for (const h of b.helfer) {
      expect(Object.keys(h).sort()).toEqual(["demo", "id", "nachname", "qualifikationen", "vorname"]);
      expect(h.qualifikationen).toEqual([{ name: "Rettungssanitäter", kurz: "RS" }]);
      expect(h.demo).toBe(false);
      expect(h.id).not.toMatch(/^[ab]$/);
    }
  });

  it("nur Freigegebene", () => {
    const db = testDb();
    wende(db, "hiorg");
    setzeFreigabe(db, [listeHelfer(db)[0].id], false);
    expect(bereitgestellteHelfer(db).helfer.map((h) => h.nachname)).toEqual([listeHelfer(db)[1].nachname]);
  });

  it("Demo-Helfer tragen das Kennzeichen", () => {
    const db = testDb();
    wende(db, "demo");
    expect(bereitgestellteHelfer(db).helfer.every((h) => h.demo)).toBe(true);
  });
});

describe("helferFuerSchichtplanung — der zweite Empfänger", () => {
  it("alle Helfer, auch ohne Einsatztagebuch-Freigabe, mit Fahrerlaubnisklassen und HiOrg-Kennung", () => {
    const db = testDb();
    wende(db, "hiorg");
    setzeFreigabe(db, [listeHelfer(db)[0].id], false);
    const b = helferFuerSchichtplanung(db);
    expect(b.helfer).toHaveLength(2);
    for (const h of b.helfer) {
      expect(Object.keys(h).sort()).toEqual(["demo", "fahrerlaubnis", "hiorgId", "id", "nachname", "qualifikationen", "vorname"]);
      expect(h.fahrerlaubnis).toEqual(["B", "C1"]);
    }
    expect(b.helfer.map((h) => h.hiorgId).sort()).toEqual(["a", "b"]);
  });

  it("die HiOrg-Kennung nur bei Helfern aus HiOrg", () => {
    const db = testDb();
    wende(db, "demo");
    expect(helferFuerSchichtplanung(db).helfer.map((h) => h.hiorgId)).toEqual([null, null]);
  });
});

describe("helferFuerLifeline — der dritte Empfänger (LLH-1194)", () => {
  function mit(db: ReturnType<typeof testDb>, quelle: "demo" | "hiorg", qualifikationen: { liste: string; name: string; kurz: string }[]) {
    const personen = [{ quellId: "q1", vorname: "Jana", nachname: "Albers", status: "aktiv", gesperrt: false, austritt: null, gruppen: ["Bereitschaft"], qualifikationen, fahrerlaubnis: ["B"] }];
    wendeAbgleichAn(db, planeAbgleich({ personen, unlesbar: 0 }, [], STANDARD_FILTER, "2026-11-25", quelle), { neueFreigeben: true, von: { name: "T", sub: "t" } });
  }

  it("genau Kennung, Name und Qualifikationsnamen; die Kennung ist die eigene, nie die aus HiOrg", () => {
    const db = testDb();
    mit(db, "hiorg", [{ liste: "med", name: "Sanitätshelfer", kurz: "SanH" }, { liste: "x", name: "Sanitätshelfer", kurz: "SH" }, { liste: "y", name: "Arzt", kurz: "A" }]);
    const { personal } = helferFuerLifeline(db);
    expect(personal).toHaveLength(1);
    expect(Object.keys(personal[0]).sort()).toEqual(["kennung", "name", "qualifikationen"]);
    expect(personal[0].name).toBe("Albers, Jana");
    expect(personal[0].qualifikationen).toEqual(["Arzt", "Sanitätshelfer"]);
    expect(personal[0].kennung).toBe(listeHelfer(db)[0].id);
    expect(personal[0].kennung).not.toBe("q1");
  });

  it("ohne Qualifikationen eine leere Liste", () => {
    const db = testDb();
    mit(db, "hiorg", []);
    expect(helferFuerLifeline(db).personal[0].qualifikationen).toEqual([]);
  });

  it("nur Freigegebene, keine Demo-Helfer", () => {
    const db = testDb();
    wende(db, "hiorg");
    setzeFreigabe(db, [listeHelfer(db)[0].id], false);
    expect(helferFuerLifeline(db).personal.map((p) => p.kennung)).toEqual([listeHelfer(db)[1].id]);
    const demo = testDb();
    wende(demo, "demo");
    expect(helferFuerLifeline(demo).personal).toEqual([]);
  });
});

/*
 * Modul-Interna sind kein API (docs/design/README.md). Aus einem anderen Modul darf ausschließlich
 * diese eine Datei kommen — Quelltext-Scan wie `core/shell/launcherEintraege.test.ts`.
 */
describe("Modulgrenze", () => {
  function dateien(ordner: string): string[] {
    return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? dateien(join(ordner, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(ordner, e.name)] : []);
  }
  it("andere Module importieren aus helfer nur `_lib/bereitstellung`", () => {
    const fremd: string[] = [];
    for (const datei of [...dateien("src/app"), ...dateien("src/core")]) {
      if (datei.startsWith(join("src/app/m/helfer"))) continue;
      for (const m of readFileSync(datei, "utf8").matchAll(/from\s+["'](@\/app\/m\/helfer\/[^"']+)["']/g)) {
        if (m[1] !== "@/app/m/helfer/_lib/bereitstellung") fremd.push(`${datei}: ${m[1]}`);
      }
    }
    expect(fremd).toEqual([]);
  });
});
