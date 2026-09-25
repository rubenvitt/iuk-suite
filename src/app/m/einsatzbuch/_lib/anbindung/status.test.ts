import { describe, expect, it } from "vitest";
import { anker, ankerAbweichung, freigabe, rechner } from "../../_db/schema";
import { ausBase64 } from "../kern/bytes";
import { ENTWICKLUNGS_KEK } from "../schluessel/kek";
import { legePaarAn } from "../schluessel/paar";
import { testDb, type TestDb } from "../testDb";
import { rechnerStatus } from "./status";
import { widerrufe } from "./rechner";

const JETZT = new Date("2026-09-25T08:00:00Z");
const kek = ausBase64(ENTWICKLUNGS_KEK);

function legeRechnerAn(db: TestDb, id: string, art: "echt" | "test", name: string): void {
  db.insert(rechner).values({
    id, art, name, tokenHash: `hash-${id}`, eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
  }).run();
}

describe("rechnerStatus", () => {
  it("ohne echten Rechner: echt ist null, test und freigaben sind leer", async () => {
    const db = testDb();
    expect(rechnerStatus(db)).toEqual({ echt: null, test: [], freigaben: [] });
  });

  it("ankerBis ist der höchste gemeldete Block, unabhängig von der Meldereihenfolge", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    legeRechnerAn(db, "re", "echt", "Einsatzleitung");
    db.insert(anker).values([
      { rechnerId: "re", block: 1, hash: "a".repeat(64), gemeldetAm: JETZT },
      { rechnerId: "re", block: 3, hash: "b".repeat(64), gemeldetAm: JETZT },
      { rechnerId: "re", block: 2, hash: "c".repeat(64), gemeldetAm: JETZT },
    ]).run();
    expect(rechnerStatus(db).echt?.ankerBis).toBe(3);
  });

  it("ohne einen einzigen Anker ist ankerBis null", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    legeRechnerAn(db, "re", "echt", "Einsatzleitung");
    expect(rechnerStatus(db).echt?.ankerBis).toBeNull();
  });

  it("Abweichungen stehen nur am betroffenen Rechner", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    legeRechnerAn(db, "re", "echt", "Einsatzleitung");
    legeRechnerAn(db, "t1", "test", "Übungsrechner");
    db.insert(ankerAbweichung).values({
      id: "abw-1", rechnerId: "re", block: 2, erwartet: "1".repeat(64), gemeldet: "2".repeat(64), zeitpunkt: JETZT,
    }).run();

    const status = rechnerStatus(db);
    expect(status.echt?.abweichungen).toHaveLength(1);
    expect(status.echt?.abweichungen[0]).toMatchObject({ block: 2, erwartet: "1".repeat(64), gemeldet: "2".repeat(64) });
    expect(status.test).toHaveLength(1);
    expect(status.test[0].abweichungen).toBe(0);
  });

  it("ein widerrufener echter Rechner erscheint nicht als aktiv", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    legeRechnerAn(db, "re", "echt", "Einsatzleitung");
    widerrufe(db, "re", JETZT);
    expect(rechnerStatus(db).echt).toBeNull();
  });

  it("trägt den Fingerabdruck des echten Schlüsselpaars", async () => {
    const db = testDb();
    const paar = await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    legeRechnerAn(db, "re", "echt", "Einsatzleitung");
    expect(rechnerStatus(db).echt?.schluesselId).toBe(paar.schluesselId);
  });

  it("Freigaben sind absteigend sortiert und auf 20 begrenzt", () => {
    const db = testDb();
    for (let i = 0; i < 25; i++) {
      db.insert(freigabe).values({
        id: `f${i}`,
        zeitpunkt: new Date(JETZT.getTime() + i * 1000),
        sub: "sub-1",
        name: "Jana Albers",
        art: "test",
        rechnerId: "r1",
        rechnerName: "Übungsrechner",
        bloecke: String(i),
        anzahl: i,
      }).run();
    }
    const { freigaben } = rechnerStatus(db);
    expect(freigaben).toHaveLength(20);
    // Der jüngste Eintrag (i = 24, spätester Zeitpunkt) steht zuerst, der 20. jüngste (i = 5) zuletzt.
    expect(freigaben[0].anzahl).toBe(24);
    expect(freigaben[19].anzahl).toBe(5);
  });
});
