import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { bzGeraete, geraete, lagerorte } from "./schema";
import { pruefeBarcodeFrei } from "./barcode";

const JETZT = new Date("2026-08-07T10:00:00Z");

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-barcode-");
  t.db.insert(lagerorte).values({
    id: "ort-1",
    name: "Lager 1",
    typ: "lager",
    aktiv: true,
  }).run();
});

afterEach(() => {
  t.schliessen();
});

function generischesGeraet(id: string, barcode: string) {
  t.db.insert(geraete).values({
    id,
    typ: "objekt",
    name: `Gerät ${id}`,
    barcode,
    lagerortId: "ort-1",
    aktiv: true,
    createdAt: JETZT,
  }).run();
}

function bzGeraet(id: string, barcode: string) {
  t.db.insert(bzGeraete).values({
    id,
    name: `BZ ${id}`,
    barcode,
    lagerortId: "ort-1",
    aktiv: true,
    createdAt: JETZT,
  }).run();
}

describe("pruefeBarcodeFrei", () => {
  it("laesst einen byte-exakt freien Barcode durch", () => {
    generischesGeraet("g-klein", "sn-1");

    expect(() => pruefeBarcodeFrei(t.db, "frei", null)).not.toThrow();
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", null)).not.toThrow();
  });

  it("blockiert Kollisionen in beiden physischen Tabellen", () => {
    generischesGeraet("g-1", "G-1");
    bzGeraet("bz-1", "BZ-1");

    expect(() => pruefeBarcodeFrei(t.db, "G-1", null))
      .toThrow(/bereits vergeben/i);
    expect(() => pruefeBarcodeFrei(t.db, "BZ-1", null))
      .toThrow(/bereits vergeben/i);
  });

  it("nimmt nur dieselbe Tabellenzeile aus und nie eine gleich benannte Fremdzeile", () => {
    generischesGeraet("identisch", "G-1");
    bzGeraet("identisch", "BZ-1");

    expect(() => pruefeBarcodeFrei(
      t.db,
      "G-1",
      { tabelle: "geraet", id: "identisch" },
    )).not.toThrow();
    expect(() => pruefeBarcodeFrei(
      t.db,
      "BZ-1",
      { tabelle: "bzGeraet", id: "identisch" },
    )).not.toThrow();

    expect(() => pruefeBarcodeFrei(
      t.db,
      "G-1",
      { tabelle: "bzGeraet", id: "identisch" },
    )).toThrow(/bereits vergeben/i);
    expect(() => pruefeBarcodeFrei(
      t.db,
      "BZ-1",
      { tabelle: "geraet", id: "identisch" },
    )).toThrow(/bereits vergeben/i);
    expect(() => pruefeBarcodeFrei(
      t.db,
      "G-1",
      { tabelle: "geraet", id: "andere-id" },
    )).toThrow(/bereits vergeben/i);
  });
});
