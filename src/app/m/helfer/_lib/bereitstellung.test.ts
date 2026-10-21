import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planeAbgleich, wendeAbgleichAn } from "./abgleich";
import { bereitgestellteHelfer } from "./bereitstellung";
import { listeHelfer, setzeFreigabe } from "./daten";
import { STANDARD_FILTER } from "./filter";
import { testDb } from "./testDb";

function wende(db: ReturnType<typeof testDb>, quelle: "demo" | "hiorg") {
  const personen = ["a", "b"].map((id) => ({
    quellId: id, vorname: `V${id}`, nachname: `N${id}`, status: "aktiv", gesperrt: false, austritt: null,
    gruppen: ["Bereitschaft"], qualifikationen: [{ liste: "med. Qualifikation", name: "Rettungssanitäter", kurz: "RS" }],
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
