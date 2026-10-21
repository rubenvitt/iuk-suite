import { describe, expect, it } from "vitest";
import type { BereitgestellterHelfer, Bereitstellung } from "@/app/m/helfer/_lib/bereitstellung";
import { person } from "../../_db/schema";
import { testDb } from "../testDb";
import { listePersonal } from "./daten";
import { hiorgQualifikationen, nameFuer, planeGegenBestand, qualiFuer, wendeHelferAbgleichAn, HELFER_PRAEFIX } from "./helferAbgleich";
import { leseQualiRegeln, schreibeQualiRegeln } from "./qualiZuordnung";

const h = (id: string, teil: Partial<BereitgestellterHelfer> = {}): BereitgestellterHelfer => ({
  id, vorname: "Jana", nachname: `Albers${id}`, qualifikationen: [{ name: "Rettungssanitäter", kurz: "RS" }], demo: false, ...teil,
});
const b = (...helfer: BereitgestellterHelfer[]): Bereitstellung => ({ helfer, stand: "2026-10-20T18:00:00.000Z" });

describe("qualiFuer — die höchste zuordenbare Qualifikation gewinnt", () => {
  it.each([
    [[{ name: "Notfallsanitäter", kurz: "NFS" }, { name: "Sanitäter", kurz: "San" }], "NotSan"],
    [[{ name: "Rettungsassistent", kurz: "RA" }], "RettAss"],
    [[{ name: "Ersthelfer", kurz: "EH" }, { name: "Rettungssanitäterin", kurz: "" }], "RS"],
    [[{ name: "Sanitäter", kurz: "San" }], "SiK"],
    [[{ name: "Sanitäter im Katastrophenschutz", kurz: "" }], "SiK"],
    [[{ name: "Sanitätshelfer", kurz: "SanH" }], "SanH"],
    [[{ name: "Ersthelfer", kurz: "EH" }, { name: "Sprechfunker", kurz: "SprF" }], null],
    [[], null],
  ])("%j → %s", (qualis, erwartet) => {
    expect(qualiFuer(qualis)).toBe(erwartet);
  });
});

describe("nameFuer", () => {
  it("baut „Nachname, Vorname“ ohne weiteres Komma", () => {
    expect(nameFuer({ vorname: "Anna, Maria", nachname: " von  Bülow " })).toBe("von Bülow, Anna Maria");
    expect(nameFuer({ vorname: "A".repeat(50), nachname: "B".repeat(40) })).toBeNull();
  });
});

describe("Abgleich mit dem Helferverzeichnis", () => {
  it("legt an, ändert, reaktiviert und deaktiviert nur eigene Zeilen", () => {
    const db = testDb();
    db.insert(person).values({ id: "hand-1", name: "Hand, Hanna", quali: "SanH", aktiv: true }).run();
    expect(wendeHelferAbgleichAn(db, planeGegenBestand(db, b(h("a"), h("b"))))).toEqual({ neu: 2, geaendert: 0, deaktiviert: 0 });
    expect(listePersonal(db).find((p) => p.id === `${HELFER_PRAEFIX}a`)).toEqual({ id: `${HELFER_PRAEFIX}a`, name: "Albersa, Jana", quali: "RS", aktiv: true });

    // b fällt weg, a bekommt eine höhere Qualifikation.
    const zwei = planeGegenBestand(db, b(h("a", { qualifikationen: [{ name: "Notfallsanitäter", kurz: "NotSan" }] })));
    expect(zwei.zeilen.map((z) => [z.id, z.klasse])).toEqual([[`${HELFER_PRAEFIX}a`, "geaendert"], [`${HELFER_PRAEFIX}b`, "deaktivieren"]]);
    expect(wendeHelferAbgleichAn(db, zwei)).toEqual({ neu: 0, geaendert: 1, deaktiviert: 1 });

    // b kommt zurück: wieder aktiv.
    const drei = planeGegenBestand(db, b(h("a", { qualifikationen: [{ name: "Notfallsanitäter", kurz: "NotSan" }] }), h("b")));
    expect(drei.zeilen.find((z) => z.id === `${HELFER_PRAEFIX}b`)).toMatchObject({ klasse: "geaendert", hinweis: "wird wieder aktiv" });
    wendeHelferAbgleichAn(db, drei);
    expect(listePersonal(db).find((p) => p.id === "hand-1")).toEqual({ id: "hand-1", name: "Hand, Hanna", quali: "SanH", aktiv: true });
  });

  it("schreibt weder Demo-Personen noch solche ohne zuordenbare Qualifikation noch Doppelte", () => {
    const db = testDb();
    db.insert(person).values({ id: "hand-1", name: "Albersd, Jana", quali: "RS", aktiv: true }).run();
    const plan = planeGegenBestand(db, b(
      h("x", { demo: true }),
      h("y", { qualifikationen: [{ name: "Ersthelfer", kurz: "EH" }] }),
      h("d"),
    ));
    expect(plan.zeilen.map((z) => z.klasse).sort()).toEqual(["demo", "doppelt", "ohne_quali"]);
    expect(plan.zeilen.find((z) => z.klasse === "ohne_quali")?.hinweis).toContain("Ersthelfer");
    expect(wendeHelferAbgleichAn(db, plan)).toEqual({ neu: 0, geaendert: 0, deaktiviert: 0 });
    expect(listePersonal(db)).toHaveLength(1);
  });

  it("zählt den Stammdatenstand hoch, damit der Rechner die Liste neu holt", () => {
    const db = testDb();
    const vorher = db.all<{ version: number }>("SELECT version FROM stammdatenstand WHERE id = 1")[0]?.version ?? 0;
    wendeHelferAbgleichAn(db, planeGegenBestand(db, b(h("a"))));
    expect(db.all<{ version: number }>("SELECT version FROM stammdatenstand WHERE id = 1")[0].version).toBeGreaterThan(vorher);
  });
});

describe("einstellbare Zuordnung (IDA-250)", () => {
  it("eine Regel geht der eingebauten Zuordnung vor, die höchste gewinnt weiter", () => {
    const qualis = [{ name: "Fachdienst Sanität", kurz: "FD-San" }, { name: "Sanitätshelfer", kurz: "SanH" }];
    expect(qualiFuer(qualis)).toBe("SanH");
    expect(qualiFuer(qualis, [{ hiorg: " fachdienst sanität ", kurz: "RS" }])).toBe("RS");
    // „nicht zuordnen“ schlägt die eingebaute Zuordnung aus.
    expect(qualiFuer([{ name: "Sanitäter", kurz: "San" }], [{ hiorg: "Sanitäter", kurz: null }])).toBeNull();
    // Ohne Namen trägt die Kurzform die Regel.
    expect(qualiFuer([{ name: "", kurz: "FDS" }], [{ hiorg: "fds", kurz: "SiK" }])).toBe("SiK");
  });

  it("listet jede HiOrg-Qualifikation einmal, mit Anzahl, eingebauter Zuordnung und Regel", () => {
    const liste = hiorgQualifikationen(
      b(h("a"), h("b", { qualifikationen: [{ name: "rettungssanitäter", kurz: "RS" }, { name: "Sprechfunker", kurz: "SprF" }] })),
      [{ hiorg: "Sprechfunker", kurz: null }, { hiorg: "Alte Qualifikation", kurz: "SanH" }],
    );
    expect(liste).toEqual([
      { hiorg: "Rettungssanitäter", kurz: "RS", anzahl: 2, eingebaut: "RS", regel: undefined },
      { hiorg: "Sprechfunker", kurz: "SprF", anzahl: 1, eingebaut: null, regel: null },
      { hiorg: "Alte Qualifikation", kurz: "", anzahl: 0, eingebaut: null, regel: "SanH" },
    ]);
  });

  it("der Abgleich plant mit den gespeicherten Regeln", () => {
    const db = testDb();
    const quelle = b(h("y", { qualifikationen: [{ name: "Ersthelfer", kurz: "EH" }] }));
    expect(planeGegenBestand(db, quelle).zeilen[0].klasse).toBe("ohne_quali");
    schreibeQualiRegeln(db, [{ hiorg: "Ersthelfer", kurz: "SanH" }]);
    const plan = planeGegenBestand(db, quelle);
    expect(plan.zeilen[0]).toMatchObject({ klasse: "neu", quali: "SanH" });
    expect(plan.qualifikationen[0]).toMatchObject({ hiorg: "Ersthelfer", regel: "SanH" });
  });
});

describe("Regeln speichern", () => {
  it("ersetzt alle Regeln, je HiOrg-Qualifikation die letzte, und löscht bei leerer Liste", () => {
    const db = testDb();
    expect(leseQualiRegeln(db)).toEqual([]);
    schreibeQualiRegeln(db, [{ hiorg: "Ersthelfer", kurz: "SanH" }, { hiorg: " ERSTHELFER", kurz: null }, { hiorg: "San", kurz: "SiK" }]);
    expect(leseQualiRegeln(db)).toEqual([{ hiorg: "ERSTHELFER", kurz: null }, { hiorg: "San", kurz: "SiK" }]);
    schreibeQualiRegeln(db, []);
    expect(leseQualiRegeln(db)).toEqual([]);
  });

  it("lehnt unbekannte Kürzel ab", () => {
    expect(() => schreibeQualiRegeln(testDb(), [{ hiorg: "X", kurz: "Arzt" as never }])).toThrow();
  });
});
