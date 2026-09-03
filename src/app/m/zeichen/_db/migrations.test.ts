import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testdb";
import { eigeneZeichen, lernsets, lernsetZeichen, lernstand, merkliste, newId } from "./schema";

describe("Migrationen zeichen", () => {
  it("legt alle fuenf Tabellen an", () => {
    const db = testDb();
    const namen = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).map((z) => z.name);
    for (const t of ["eigene_zeichen", "lernset_zeichen", "lernsets", "lernstand", "merkliste"]) {
      expect(namen, t).toContain(t);
    }
  });

  /*
   * ZEITSTEMPEL IN SEKUNDEN, NICHT MILLISEKUNDEN. Ueber die Drizzle-Schicht ist der
   * Unterschied unsichtbar (beide Richtungen rechnen konsistent um) — nur der Rohwert
   * zeigt ihn. m/qr/_db/schema.ts macht es anders, und ein Copy-Paste von dort ist der
   * wahrscheinlichste Weg in den Faktor-1000-Fehler.
   */
  it("schreibt Zeitstempel in Sekunden", () => {
    const db = testDb();
    db.insert(merkliste).values({
      sub: "dev:a", zeichenId: "rezept:C.1.1", titelSchnappschuss: "Loeschstaffel",
    }).run();
    const roh = db.get<{ erstellt_am: number }>(sql`SELECT erstellt_am FROM merkliste`);
    // Sekunden seit 1970 liegen heute bei ~1.8e9, Millisekunden bei ~1.8e12.
    expect(roh.erstellt_am).toBeLessThan(1e11);
  });

  /*
   * DER WICHTIGSTE FALL DIESER AUFGABE. Ein uniqueIndex auf (sub, spec_kanon)
   * zusammen mit onConflictDoUpdate benennt ein bereits gespeichertes Zeichen STILL
   * UM, statt ein zweites anzulegen: wer „Zugtrupp Nord" gespeichert hat und dieselbe
   * Zusammenstellung zwei Wochen spaeter als „Test" sichert, findet „Zugtrupp Nord"
   * danach nicht mehr — und niemand hat geloescht. „Schon gespeichert?" ist eine
   * LESEFRAGE, keine Eindeutigkeitszusage. Die Eindeutigkeit liegt deshalb auf dem
   * Namen, den der Nutzer versteht.
   */
  it("erlaubt denselben kanonischen Schluessel zweimal, denselben Namen nicht", () => {
    const db = testDb();
    const basis = {
      sub: "dev:a", specJson: "{}", specKanon: "kind=formation",
      svgZwischenspeicher: "<svg></svg>", paketVersion: "1.1.0", datenVersion: "0.2.0",
    };
    db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Zugtrupp Nord" }).run();
    expect(() =>
      db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Test" }).run(),
    ).not.toThrow();
    expect(() =>
      db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Test" }).run(),
    ).toThrow();
  });

  it("begrenzt die Lernstufe auf 0 bis 4", () => {
    const db = testDb();
    expect(() =>
      db.insert(lernstand).values({
        sub: "dev:a", zeichenId: "rezept:C.1.1", stufe: 5, faelligAm: "2026-09-02",
      }).run(),
    ).toThrow();
  });

  it("raeumt Lernset-Eintraege mit ihrem Lernset weg", () => {
    const db = testDb();
    const id = newId();
    db.insert(lernsets).values({ id, slug: "rd", titel: "Rettungsdienst", erstelltVon: "dev:a" }).run();
    db.insert(lernsetZeichen).values({
      lernsetId: id, zeichenId: "rezept:C.1.1", titelSchnappschuss: "Loeschstaffel", position: 0,
    }).run();
    db.delete(lernsets).run();
    expect(db.select().from(lernsetZeichen).all().length).toBe(0);
  });
});
