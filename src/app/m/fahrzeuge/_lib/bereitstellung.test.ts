import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bereitgestellteFahrzeuge } from "./bereitstellung";
import { setzeAktiv, speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";
import { testDb } from "./testDb";

const RTW = { art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831", standort: "Uelzen", bemerkung: "Wache Nord", aktiv: true };

describe("bereitgestellteFahrzeuge — was das Modul anderen Modulen herausgibt", () => {
  it("genau diese Felder, ohne Bemerkung und Zeitstempel", () => {
    const db = testDb();
    speichereFahrzeug(db, null, fahrzeugEingabe.parse(RTW));
    const b = bereitgestellteFahrzeuge(db);
    expect(b.fahrzeuge).toHaveLength(1);
    expect(Object.keys(b.fahrzeuge[0]).sort()).toEqual(["aktiv", "art", "funkkenner", "funkrufname", "id", "kennzeichen", "standort", "typ"]);
  });

  it("auch deaktivierte, mit Status — der Empfänger deaktiviert sie dann bei sich", () => {
    const db = testDb();
    const f = speichereFahrzeug(db, null, fahrzeugEingabe.parse(RTW));
    setzeAktiv(db, f.id, false);
    expect(bereitgestellteFahrzeuge(db).fahrzeuge.map((x) => x.aktiv)).toEqual([false]);
  });

  it("der Stand rückt mit jeder Änderung vor und ist ohne Bestand null", () => {
    const db = testDb();
    expect(bereitgestellteFahrzeuge(db).stand).toBeNull();
    const f = speichereFahrzeug(db, null, fahrzeugEingabe.parse(RTW), new Date("2026-10-21T08:00:00Z"));
    expect(bereitgestellteFahrzeuge(db).stand).toBe("2026-10-21T08:00:00.000Z");
    setzeAktiv(db, f.id, false, new Date("2026-10-22T08:00:00Z"));
    expect(bereitgestellteFahrzeuge(db).stand).toBe("2026-10-22T08:00:00.000Z");
  });
});

/*
 * Modul-Interna sind kein API (docs/design/README.md). Aus einem anderen Modul darf ausschließlich
 * diese eine Datei kommen — Quelltext-Scan wie `helfer/_lib/bereitstellung.test.ts`.
 */
describe("Modulgrenze", () => {
  function dateien(ordner: string): string[] {
    return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? dateien(join(ordner, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(ordner, e.name)] : []);
  }
  it("andere Module importieren aus fahrzeuge nur `_lib/bereitstellung`", () => {
    const fremd: string[] = [];
    for (const datei of [...dateien("src/app"), ...dateien("src/core")]) {
      if (datei.startsWith(join("src/app/m/fahrzeuge"))) continue;
      for (const m of readFileSync(datei, "utf8").matchAll(/from\s+["'](@\/app\/m\/fahrzeuge\/[^"']+)["']/g)) {
        if (m[1] !== "@/app/m/fahrzeuge/_lib/bereitstellung") fremd.push(`${datei}: ${m[1]}`);
      }
    }
    expect(fremd).toEqual([]);
  });
});
