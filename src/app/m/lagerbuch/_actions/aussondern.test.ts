import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const { adminRiegel, revalidiert } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test - jeder Aufruf uebergibt t.db"); },
}));

import { aussondern } from "./aussondern";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-aussondern-");

  // `handlager` wird von der Migration angelegt. `lagerorte` hat kein createdAt.
  t.db.insert(lagerorte).values({
    id: "fz-1",
    name: "RTW 1",
    typ: "fahrzeug",
    aktiv: true,
  }).run();
  t.db.insert(artikel).values([
    {
      id: "art-charge",
      name: "Mullbinde",
      einheit: "Stk",
      fach: "A-01",
      mindestbestand: 1,
      aktiv: true,
      createdAt: JETZT,
    },
    {
      // Existiert absichtlich: vertraute die Action einer Client-ID, bliebe der
      // Fremdschluessel gruen und nur die fachliche Zusage faende den Fehler.
      id: "art-client",
      name: "Fremder Artikel",
      einheit: "Stk",
      fach: "B-01",
      mindestbestand: 0,
      aktiv: true,
      createdAt: JETZT,
    },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function charge(id: string, verfall: string) {
  t.db.insert(chargen).values({
    id,
    artikelId: "art-charge",
    chargenNr: `Charge ${id}`,
    verfall,
    createdAt: JETZT,
  }).run();
}

function buchen({
  id,
  chargeId,
  lagerortId,
  menge,
  typ = "zugang",
}: {
  id: string;
  chargeId: string;
  lagerortId: string;
  menge: number;
  typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
}) {
  t.db.insert(buchungen).values({
    id,
    ts: JETZT,
    typ,
    artikelId: "art-charge",
    chargeId,
    lagerortId,
    menge,
    quelleTyp: "system",
    quelleId: "seed",
    referenz: null,
    kommentar: null,
  }).run();
}

function alleBuchungen() {
  return t.db.select().from(buchungen).all();
}

function fehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; fehler: string }).fehler;
}

function feldFehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler;
}

function erwarteKeineNebenwirkung(anzahlVorher: number) {
  expect(alleBuchungen()).toHaveLength(anzahlVorher);
  expect(revalidiert).toEqual([]);
}

describe("aussondern", () => {
  it("schreibt genau eine negative korrektur fuer den Handlager-Rest", async () => {
    charge("ch-alt", "2020-01");
    buchen({ id: "seed-plus", chargeId: "ch-alt", lagerortId: HANDLAGER_ID, menge: 10 });
    buchen({
      id: "seed-minus",
      chargeId: "ch-alt",
      lagerortId: HANDLAGER_ID,
      menge: -3,
      typ: "entnahme",
    });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern(
      {
        chargeId: "ch-alt",
        artikelId: "art-client",
        kommentar: "  Verfallskontrolle 08/2026  ",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    const nachher = alleBuchungen();
    expect(nachher).toHaveLength(anzahlVorher + 1);
    const geschrieben = nachher.filter((b) => b.quelleTyp === "oidc");
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({
      typ: "korrektur",
      menge: -7,
      artikelId: "art-charge",
      chargeId: "ch-alt",
      lagerortId: HANDLAGER_ID,
      quelleTyp: "oidc",
      quelleId: "u-admin",
      referenz: null,
      kommentar: "Verfallskontrolle 08/2026",
    });
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("schliesst Bestand derselben Charge in einem Fahrzeug aus", async () => {
    charge("ch-verteilt", "2020-01");
    buchen({ id: "seed-hand", chargeId: "ch-verteilt", lagerortId: HANDLAGER_ID, menge: 3 });
    buchen({ id: "seed-fz", chargeId: "ch-verteilt", lagerortId: "fz-1", menge: 9 });

    const erg = await aussondern({ chargeId: "ch-verteilt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(true);
    const geschrieben = alleBuchungen().filter((b) => b.quelleTyp === "oidc");
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({
      chargeId: "ch-verteilt",
      lagerortId: HANDLAGER_ID,
      menge: -3,
    });
  });

  it("lehnt eine noch gueltige Charge ohne Schreiben oder Revalidierung ab", async () => {
    charge("ch-gueltig", "2099-12");
    buchen({ id: "seed-gueltig", chargeId: "ch-gueltig", lagerortId: HANDLAGER_ID, menge: 5 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-gueltig", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/abgelaufen/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("meldet eine unbekannte Charge ohne Schreiben oder Revalidierung", async () => {
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-unbekannt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/nicht gefunden/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("lehnt eine Charge ohne positiven Handlager-Rest trotz Fahrzeugbestand ab", async () => {
    charge("ch-ohne-hand", "2020-01");
    buchen({ id: "seed-nur-fz", chargeId: "ch-ohne-hand", lagerortId: "fz-1", menge: 4 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-ohne-hand", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/Restbestand/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("lehnt einen leeren Kommentar als Feldfehler ohne Nebenwirkung ab", async () => {
    charge("ch-kommentar", "2020-01");
    buchen({ id: "seed-kommentar", chargeId: "ch-kommentar", lagerortId: HANDLAGER_ID, menge: 1 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-kommentar", kommentar: "   " }, t.db);

    expect(erg.ok).toBe(false);
    expect(feldFehlerVon(erg)?.kommentar).toMatch(/Kommentar erforderlich/);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("ruft den Admin-Riegel vor der Validierung auf", async () => {
    const riegelFehler = new Error("Riegel vor Validierung");
    adminRiegel.mockRejectedValueOnce(riegelFehler);
    const anzahlVorher = alleBuchungen().length;

    await expect(aussondern({}, t.db)).rejects.toBe(riegelFehler);

    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("gibt beliebige Datenbankfehler nicht an den Client weiter", async () => {
    charge("ch-defekt", "2020-01");
    buchen({ id: "seed-defekt", chargeId: "ch-defekt", lagerortId: HANDLAGER_ID, menge: 2 });
    t.sqlite.exec(`
      CREATE TRIGGER aussondern_test_defekt
      BEFORE INSERT ON buchungen
      WHEN NEW.quelle_typ = 'oidc'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheime Infrastrukturmeldung');
      END;
    `);
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-defekt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toBe("Aussondern fehlgeschlagen.");
    expect(fehlerVon(erg)).not.toContain("db-intern");
    erwarteKeineNebenwirkung(anzahlVorher);
  });
});
