import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { bzGeraete, geraete, lagerorte } from "../_db/schema";

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

import {
  geraetSpeichern,
  geraetZuBarcode,
  setGeraetAktiv,
} from "./geraete";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const LISTENPFAD = "/m/lagerbuch/verwaltung/geraete";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-geraete-");
  t.db.insert(lagerorte).values([
    { id: "ort-aktiv", name: "Lager aktiv", typ: "lager", aktiv: true },
    { id: "ort-inaktiv", name: "Lager inaktiv", typ: "lager", aktiv: false },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function wertVon<T>(erg: { ok: boolean }): T {
  expect(erg.ok).toBe(true);
  return (erg as { ok: true; wert: T }).wert;
}

function fehlerVon(erg: { ok: boolean }) {
  return erg as { ok: false; fehler: string; feldFehler?: Record<string, string> };
}

function geraeteZeilen() {
  return t.db.select().from(geraete).all();
}

function erwartetePfade(id: string) {
  return [LISTENPFAD, `${LISTENPFAD}/${id}`];
}

function sqliteAenderungen() {
  return (t.sqlite.prepare("SELECT total_changes() AS anzahl").get() as { anzahl: number }).anzahl;
}

describe("Bauform und Riegel", () => {
  it("exportiert genau die drei bewachten Actions", async () => {
    const mod = await import("./geraete");

    expect(Object.keys(mod).sort()).toEqual([
      "geraetSpeichern",
      "geraetZuBarcode",
      "setGeraetAktiv",
    ]);
  });

  it.each([
    ["geraetSpeichern", () => geraetSpeichern({}, t.db)],
    ["setGeraetAktiv", () => setGeraetAktiv({}, t.db)],
    ["geraetZuBarcode", () => geraetZuBarcode("SN-1", t.db)],
  ])("%s ruft den Admin-Riegel vor Validierung oder Datenzugriff auf", async (_name, aufruf) => {
    const riegelFehler = new Error("Riegel vor Eingabe und DB");
    adminRiegel.mockRejectedValueOnce(riegelFehler);

    await expect(aufruf()).rejects.toBe(riegelFehler);

    expect(geraeteZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("geraetSpeichern", () => {
  it("legt Medizin byte-exakt an, trimmt Text und nullt alle Objektfelder", async () => {
    const erg = await geraetSpeichern({
      typ: "medizin",
      name: "  Defi  ",
      barcode: "  sn-1  ",
      lagerortId: "ort-aktiv",
      anmerkung: "  geprüft  ",
      mtkFaellig: "2027-05-31",
      beschreibung: "wird verworfen",
      ablaufdatum: "2028-01-01",
    }, t.db);
    const id = wertVon<{ id: string }>(erg).id;

    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()).toMatchObject({
      id,
      typ: "medizin",
      name: "Defi",
      barcode: "sn-1",
      lagerortId: "ort-aktiv",
      anmerkung: "geprüft",
      mtkFaellig: "2027-05-31",
      beschreibung: null,
      ablaufdatum: null,
      aktiv: true,
    });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("nullt beim Typwechsel in beide Richtungen jedes typfremde Feld", async () => {
    const erstellt = await geraetSpeichern({
      typ: "medizin",
      name: "Koffer",
      lagerortId: "ort-aktiv",
      mtkFaellig: "2027-05-31",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    const createdAt = t.db.select().from(geraete).where(eq(geraete.id, id)).get()!.createdAt;

    revalidiert.length = 0;
    const zuObjekt = await geraetSpeichern({
      id,
      typ: "objekt",
      name: "Koffer als Objekt",
      lagerortId: "ort-aktiv",
      mtkFaellig: "2028-01-01",
      beschreibung: "mit Inhalt",
      ablaufdatum: "2029-12-31",
    }, t.db);
    expect(wertVon<{ id: string }>(zuObjekt).id).toBe(id);
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()).toMatchObject({
      id,
      typ: "objekt",
      mtkFaellig: null,
      beschreibung: "mit Inhalt",
      ablaufdatum: "2029-12-31",
      aktiv: true,
      createdAt,
    });
    expect(revalidiert).toEqual(erwartetePfade(id));

    revalidiert.length = 0;
    await geraetSpeichern({
      id,
      typ: "medizin",
      name: "Koffer wieder Medizin",
      lagerortId: "ort-aktiv",
      mtkFaellig: "2030-01-01",
      beschreibung: "muss weg",
      ablaufdatum: "2031-01-01",
    }, t.db);
    expect(geraeteZeilen()).toHaveLength(1);
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()).toMatchObject({
      id,
      typ: "medizin",
      mtkFaellig: "2030-01-01",
      beschreibung: null,
      ablaufdatum: null,
      aktiv: true,
      createdAt,
    });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it.each([
    ["mtkFaellig", {
      typ: "medizin", name: "Defi", lagerortId: "ort-aktiv", mtkFaellig: "2026-02-31",
    }],
    ["ablaufdatum", {
      typ: "objekt", name: "Zelt", lagerortId: "ort-aktiv", ablaufdatum: "2026-02-31",
    }],
  ])("weist einen formrichtigen, aber unechten Kalendertag in %s ab", async (feld, eingabe) => {
    const erg = await geraetSpeichern(eingabe, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg).feldFehler?.[feld]).toMatch(/Kalendertag/i);
    expect(geraeteZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it.each(["ort-fehlt", "ort-inaktiv"])(
    "lehnt den fehlenden oder inaktiven Lagerort %s mit festem Fehler vor dem Schreiben ab",
    async (lagerortId) => {
      const erg = await geraetSpeichern({
        typ: "objekt",
        name: "Zelt",
        lagerortId,
      }, t.db);

      expect(erg).toEqual({ ok: false, fehler: LAGERORT_FEHLER });
      expect(geraeteZeilen()).toEqual([]);
      expect(revalidiert).toEqual([]);
    },
  );

  it("meldet Barcode-Kollisionen aus geraete mit festem Feldfehler", async () => {
    await geraetSpeichern({
      typ: "objekt", name: "A", lagerortId: "ort-aktiv", barcode: "DOPPELT",
    }, t.db);
    revalidiert.length = 0;

    const erg = await geraetSpeichern({
      typ: "objekt", name: "B", lagerortId: "ort-aktiv", barcode: "DOPPELT",
    }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Barcode bereits vergeben.",
      feldFehler: { barcode: "Barcode bereits vergeben." },
    });
    expect(geraeteZeilen()).toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("meldet Barcode-Kollisionen aus bz_geraete genauso", async () => {
    t.db.insert(bzGeraete).values({
      id: "bz-1",
      name: "BZ",
      barcode: "DOPPELT",
      lagerortId: "ort-aktiv",
      aktiv: true,
      createdAt: JETZT,
    }).run();

    const erg = await geraetSpeichern({
      typ: "medizin", name: "Defi", lagerortId: "ort-aktiv", barcode: "DOPPELT",
    }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Barcode bereits vergeben.",
      feldFehler: { barcode: "Barcode bereits vergeben." },
    });
    expect(geraeteZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("erlaubt beim Bearbeiten den Barcode genau der eigenen Geraete-Zeile", async () => {
    const erstellt = await geraetSpeichern({
      typ: "objekt", name: "A", lagerortId: "ort-aktiv", barcode: "Eigen-1",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    revalidiert.length = 0;

    const erg = await geraetSpeichern({
      id,
      typ: "objekt",
      name: "A neu",
      lagerortId: "ort-aktiv",
      barcode: "Eigen-1",
    }, t.db);

    expect(wertVon<{ id: string }>(erg).id).toBe(id);
    expect(geraeteZeilen()).toHaveLength(1);
    expect(geraeteZeilen()[0]).toMatchObject({ id, name: "A neu", barcode: "Eigen-1" });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Speicherfehler zurueck", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER geraete_insert_defekt
      BEFORE INSERT ON geraete
      BEGIN
        SELECT RAISE(ABORT, 'SQL_GEHEIMNIS');
      END;
    `);

    const erg = await geraetSpeichern({
      typ: "objekt", name: "A", lagerortId: "ort-aktiv",
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Gerät konnte nicht gespeichert werden." });
    expect(fehlerVon(erg).fehler).not.toContain("SQL_GEHEIMNIS");
    expect(geraeteZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("setGeraetAktiv", () => {
  it("lehnt eine ungueltige Eingabe ohne Schreiben oder Revalidierung ab", async () => {
    const erg = await setGeraetAktiv({ id: "", aktiv: "nein" }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(geraeteZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("schaltet nur aktiv und revalidiert Liste vor Detail", async () => {
    const erstellt = await geraetSpeichern({
      typ: "objekt", name: "A", lagerortId: "ort-aktiv",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    const vorher = t.db.select().from(geraete).where(eq(geraete.id, id)).get()!;
    revalidiert.length = 0;

    const erg = await setGeraetAktiv({ id, aktiv: false }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()).toEqual({
      ...vorher,
      aktiv: false,
    });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Statusfehler zurueck", async () => {
    const erstellt = await geraetSpeichern({
      typ: "objekt", name: "A", lagerortId: "ort-aktiv",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    revalidiert.length = 0;
    t.sqlite.exec(`
      CREATE TRIGGER geraete_update_defekt
      BEFORE UPDATE ON geraete
      BEGIN
        SELECT RAISE(ABORT, 'STATUS_GEHEIMNIS');
      END;
    `);

    const erg = await setGeraetAktiv({ id, aktiv: false }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Gerätestatus konnte nicht geändert werden." });
    expect(fehlerVon(erg).fehler).not.toContain("STATUS_GEHEIMNIS");
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()?.aktiv).toBe(true);
    expect(revalidiert).toEqual([]);
  });
});

describe("geraetZuBarcode", () => {
  it("findet raw und /g/-Deep-Links byte-exakt, wirft nie bei kaputtem Prozent und bleibt read-only", async () => {
    const klein = wertVon<{ id: string }>(await geraetSpeichern({
      typ: "objekt", name: "klein", lagerortId: "ort-aktiv", barcode: "sn-1",
    }, t.db)).id;
    const prozent = wertVon<{ id: string }>(await geraetSpeichern({
      typ: "objekt", name: "prozent", lagerortId: "ort-aktiv", barcode: "SN%ZZ",
    }, t.db)).id;
    revalidiert.length = 0;
    const aenderungenVorher = sqliteAenderungen();

    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("  sn-1  ", t.db)))
      .toEqual({ id: klein });
    expect(wertVon<{ id: string } | null>(
      await geraetZuBarcode("https://lagerbuch.example/g/sn-1?quelle=qr", t.db),
    )).toEqual({ id: klein });
    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("SN-1", t.db)))
      .toBeNull();
    await expect(geraetZuBarcode("https://lagerbuch.example/g/SN%ZZ", t.db))
      .resolves.toEqual({ ok: true, wert: { id: prozent } });
    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("unbekannt", t.db)))
      .toBeNull();

    expect(sqliteAenderungen()).toBe(aenderungenVorher);
    expect(revalidiert).toEqual([]);
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Suchfehler zurueck", async () => {
    t.sqlite.exec("DROP TABLE geraete");

    const erg = await geraetZuBarcode("SN-1", t.db);

    expect(erg).toEqual({ ok: false, fehler: "Gerät konnte nicht gesucht werden." });
    expect(fehlerVon(erg).fehler).not.toMatch(/no such table|sqlite/i);
    expect(revalidiert).toEqual([]);
  });
});
