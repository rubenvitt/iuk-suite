import { describe, it, expect } from "vitest";
import { testDb } from "./testdb";
import {
  eigeneZeichenVon,
  eigenesZeichenMitKanon,
  eigenesZeichenMitNamen,
  legeEigenesZeichenAn,
  ueberschreibeEigenesZeichen,
} from "./eigeneZeichen";

const werte = (zusatz: Partial<Parameters<typeof legeEigenesZeichenAn>[1]> = {}) => ({
  sub: "sub-1",
  name: "Zugtrupp Nord",
  specJson: '{"kind":"formation"}',
  specKanon: "kind=formation",
  svg: "<svg/></svg>",
  paketVersion: "1.1.0",
  datenVersion: "0.2.0",
  ...zusatz,
});

describe("eigene Zeichen", () => {
  it("legt an und liest die eigenen zurueck", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    legeEigenesZeichenAn(db, werte({ name: "Zweites" }));
    legeEigenesZeichenAn(db, werte({ sub: "sub-2", name: "Fremdes" }));
    const meine = eigeneZeichenVon(db, "sub-1");
    expect(meine.map((z) => z.name).sort()).toEqual(["Zugtrupp Nord", "Zweites"]);
  });

  /*
   * ⛔ DIESELBE ZUSAMMENSTELLUNG DARF ZWEIMAL DASTEHEN, DERSELBE NAME NICHT.
   * Ein uniqueIndex auf spec_kanon zusammen mit onConflictDoUpdate benennte ein
   * bereits gespeichertes Zeichen STILL UM: wer „Zugtrupp Nord" gespeichert hat
   * und dieselbe Zusammenstellung zwei Wochen spaeter als „Test" sichert, faende
   * „Zugtrupp Nord" danach nicht mehr — und niemand haette geloescht. „Schon
   * gespeichert?" ist eine LESEFRAGE, keine Eindeutigkeitszusage.
   */
  it("erlaubt denselben kanonischen Schluessel zweimal", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    legeEigenesZeichenAn(db, werte({ name: "Test" }));
    expect(eigeneZeichenVon(db, "sub-1").length).toBe(2);
  });

  it("verbietet denselben Namen zweimal bei derselben Person", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(() => legeEigenesZeichenAn(db, werte({ specKanon: "anders" }))).toThrow();
  });

  it("erlaubt denselben Namen bei zwei Personen", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(() => legeEigenesZeichenAn(db, werte({ sub: "sub-2" }))).not.toThrow();
  });

  it("findet nach Name und nach Zusammenstellung — nur die eigenen", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(eigenesZeichenMitNamen(db, "sub-1", "Zugtrupp Nord")?.name).toBe("Zugtrupp Nord");
    expect(eigenesZeichenMitNamen(db, "sub-2", "Zugtrupp Nord")).toBeNull();
    expect(eigenesZeichenMitKanon(db, "sub-1", "kind=formation")?.name).toBe("Zugtrupp Nord");
    expect(eigenesZeichenMitKanon(db, "sub-2", "kind=formation")).toBeNull();
  });

  it("ueberschreibt Zusammenstellung, Bild und Versionen", () => {
    const db = testDb();
    const id = legeEigenesZeichenAn(db, werte());
    ueberschreibeEigenesZeichen(db, id, {
      specJson: '{"kind":"person"}',
      specKanon: "kind=person",
      svg: "<svg>neu</svg>",
      paketVersion: "1.2.0",
      datenVersion: "0.3.0",
    });
    const zeile = eigenesZeichenMitNamen(db, "sub-1", "Zugtrupp Nord");
    expect(zeile?.specKanon).toBe("kind=person");
    expect(zeile?.paketVersion).toBe("1.2.0");
  });
});
