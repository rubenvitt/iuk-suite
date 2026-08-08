import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  bzGeraete,
  bzKontrollen,
  geraete,
  lagerorte,
} from "../_db/schema";

const {
  adminRiegel,
  bewertungOverride,
  revalidiert,
} = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  bewertungOverride: {
    current: null as null | {
      level1ImBereich: boolean | null;
      level2ImBereich: boolean | null;
      bestanden: boolean;
    },
  },
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

vi.mock("../_lib/domain/bz", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../_lib/domain/bz")>();
  return {
    ...echt,
    bewerteKontrolle: (
      eingabe: Parameters<typeof echt.bewerteKontrolle>[0],
    ) => bewertungOverride.current ?? echt.bewerteKontrolle(eingabe),
  };
});

import {
  geraetSpeichern,
  geraetZuBarcode,
  kontrolleErfassen,
  setGeraetAktiv,
} from "./bz";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const LISTENPFAD = "/m/lagerbuch/verwaltung/bz";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";
const REF_SNAPSHOT = "{\"streifenLot\":\"LOT-A\",\"level1Label\":\"L1\",\"level1Min\":40,\"level1Max\":60,\"level2Label\":\"L2\",\"level2Min\":250,\"level2Max\":350}";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  bewertungOverride.current = null;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-bz-");
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
  return erg as {
    ok: false;
    fehler: string;
    feldFehler?: Record<string, string>;
  };
}

function bzZeilen() {
  return t.db.select().from(bzGeraete).all();
}

function kontrollZeilen() {
  return t.db.select().from(bzKontrollen).all();
}

function erwartetePfade(id: string) {
  return [LISTENPFAD, `${LISTENPFAD}/${id}`];
}

function sqliteAenderungen() {
  return (t.sqlite.prepare("SELECT total_changes() AS anzahl").get() as {
    anzahl: number;
  }).anzahl;
}

async function geraetMitBereichen(): Promise<string> {
  const erg = await geraetSpeichern({
    name: "Accu-Chek",
    barcode: "BZ-1",
    lagerortId: "ort-aktiv",
    streifenLot: "LOT-A",
    level1Label: "L1",
    level1Min: 40,
    level1Max: 60,
    level2Label: "L2",
    level2Min: 250,
    level2Max: 350,
  }, t.db);
  return wertVon<{ id: string }>(erg).id;
}

async function geraetOhneBereiche(): Promise<string> {
  const erg = await geraetSpeichern({
    name: "Ohne Bereiche",
    lagerortId: "ort-aktiv",
  }, t.db);
  return wertVon<{ id: string }>(erg).id;
}

describe("Bauform und Riegel", () => {
  it("exportiert genau die vier bewachten Actions", async () => {
    const mod = await import("./bz");

    expect(Object.keys(mod).sort()).toEqual([
      "geraetSpeichern",
      "geraetZuBarcode",
      "kontrolleErfassen",
      "setGeraetAktiv",
    ]);
  });

  it.each([
    ["geraetSpeichern", () => geraetSpeichern({}, t.db)],
    ["setGeraetAktiv", () => setGeraetAktiv({}, t.db)],
    ["geraetZuBarcode", () => geraetZuBarcode("BZ-1", t.db)],
    ["kontrolleErfassen", () => kontrolleErfassen({}, t.db)],
  ])("%s ruft den Admin-Riegel vor Validierung oder Datenzugriff auf", async (_name, aufruf) => {
    const riegelFehler = new Error("Riegel vor Eingabe und DB");
    adminRiegel.mockRejectedValueOnce(riegelFehler);

    await expect(aufruf()).rejects.toBe(riegelFehler);

    expect(bzZeilen()).toEqual([]);
    expect(kontrollZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("geraetSpeichern", () => {
  it("legt alle Felder byte-exakt an, trimmt Text und revalidiert Liste vor Detail", async () => {
    const erg = await geraetSpeichern({
      name: "  Accu-Chek  ",
      barcode: "  bz-klein  ",
      lagerortId: "ort-aktiv",
      streifenLot: "  LOT-A  ",
      level1Label: "  L1  ",
      level1Min: "40",
      level1Max: 60,
      level2Label: "  L2  ",
      level2Min: 250,
      level2Max: "350",
    }, t.db);
    const id = wertVon<{ id: string }>(erg).id;

    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get())
      .toMatchObject({
        id,
        name: "Accu-Chek",
        barcode: "bz-klein",
        lagerortId: "ort-aktiv",
        streifenLot: "LOT-A",
        level1Label: "L1",
        level1Min: 40,
        level1Max: 60,
        level2Label: "L2",
        level2Min: 250,
        level2Max: 350,
        aktiv: true,
      });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("aktualisiert dieselbe Zeile und leert jedes ausgelassene optionale Feld", async () => {
    const id = await geraetMitBereichen();
    const createdAt = t.db.select().from(bzGeraete)
      .where(eq(bzGeraete.id, id)).get()!.createdAt;
    await setGeraetAktiv({ id, aktiv: false }, t.db);
    revalidiert.length = 0;

    const erg = await geraetSpeichern({
      id,
      name: "Accu-Chek ohne Referenzen",
      lagerortId: "ort-aktiv",
    }, t.db);

    expect(wertVon<{ id: string }>(erg).id).toBe(id);
    expect(bzZeilen()).toHaveLength(1);
    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get())
      .toEqual({
        id,
        name: "Accu-Chek ohne Referenzen",
        barcode: null,
        lagerortId: "ort-aktiv",
        streifenLot: null,
        level1Label: null,
        level1Min: null,
        level1Max: null,
        level2Label: null,
        level2Min: null,
        level2Max: null,
        aktiv: false,
        createdAt,
      });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it.each(["ort-fehlt", "ort-inaktiv"])(
    "lehnt den fehlenden oder inaktiven Lagerort %s mit dem festen Fehler ab",
    async (lagerortId) => {
      const erg = await geraetSpeichern({
        name: "Accu-Chek",
        lagerortId,
      }, t.db);

      expect(erg).toEqual({ ok: false, fehler: LAGERORT_FEHLER });
      expect(bzZeilen()).toEqual([]);
      expect(revalidiert).toEqual([]);
    },
  );

  it("lehnt eine unbekannte Bearbeitungs-ID vor Lagerort- und Barcode-Pruefung ab", async () => {
    t.db.insert(geraete).values({
      id: "generic-1",
      typ: "objekt",
      name: "Generisch",
      barcode: "DOPPELT",
      lagerortId: "ort-aktiv",
      aktiv: true,
      createdAt: JETZT,
    }).run();

    const ohneLagerort = await geraetSpeichern({
      id: "bz-fehlt",
      name: "Unbekannt",
      lagerortId: "ort-fehlt",
      barcode: "frei",
    }, t.db);
    const mitKollision = await geraetSpeichern({
      id: "bz-fehlt",
      name: "Unbekannt",
      lagerortId: "ort-aktiv",
      barcode: "DOPPELT",
    }, t.db);

    expect(ohneLagerort).toEqual({ ok: false, fehler: "BZ-Gerät nicht gefunden." });
    expect(mitKollision).toEqual({ ok: false, fehler: "BZ-Gerät nicht gefunden." });
    expect(bzZeilen()).toEqual([]);
    expect(t.db.select().from(geraete).all()).toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("blockiert einen Barcode aus der generischen Geraetetabelle mit festem Feldfehler", async () => {
    t.db.insert(geraete).values({
      id: "generic-1",
      typ: "objekt",
      name: "Generisch",
      barcode: "DOPPELT",
      lagerortId: "ort-aktiv",
      aktiv: true,
      createdAt: JETZT,
    }).run();

    const erg = await geraetSpeichern({
      name: "BZ",
      lagerortId: "ort-aktiv",
      barcode: "DOPPELT",
    }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Barcode bereits vergeben.",
      feldFehler: { barcode: "Barcode bereits vergeben." },
    });
    expect(bzZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("nimmt beim Bearbeiten genau die eigene BZ-Zeile vom Barcode-Riegel aus", async () => {
    const erstellt = await geraetSpeichern({
      name: "BZ",
      lagerortId: "ort-aktiv",
      barcode: "Eigen-1",
    }, t.db);
    const id = wertVon<{ id: string }>(erstellt).id;
    revalidiert.length = 0;

    const erg = await geraetSpeichern({
      id,
      name: "BZ neu",
      lagerortId: "ort-aktiv",
      barcode: "Eigen-1",
    }, t.db);

    expect(wertVon<{ id: string }>(erg).id).toBe(id);
    expect(bzZeilen()).toHaveLength(1);
    expect(bzZeilen()[0]).toMatchObject({ id, name: "BZ neu", barcode: "Eigen-1" });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Speicherfehler zurueck", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER bz_geraete_insert_defekt
      BEFORE INSERT ON bz_geraete
      BEGIN
        SELECT RAISE(ABORT, 'BZ_SQL_GEHEIMNIS');
      END;
    `);

    const erg = await geraetSpeichern({
      name: "BZ",
      lagerortId: "ort-aktiv",
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "BZ-Gerät konnte nicht gespeichert werden." });
    expect(fehlerVon(erg).fehler).not.toContain("BZ_SQL_GEHEIMNIS");
    expect(bzZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("setGeraetAktiv", () => {
  it("lehnt eine ungueltige Eingabe ohne Schreiben oder Revalidierung ab", async () => {
    const erg = await setGeraetAktiv({ id: "", aktiv: "nein" }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(bzZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("schaltet nur aktiv und revalidiert Liste vor Detail", async () => {
    const id = await geraetOhneBereiche();
    const vorher = t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()!;
    revalidiert.length = 0;

    const erg = await setGeraetAktiv({ id, aktiv: false }, t.db);

    expect(erg).toEqual({ ok: true });
    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get())
      .toEqual({ ...vorher, aktiv: false });
    expect(revalidiert).toEqual(erwartetePfade(id));
  });

  it("lehnt eine unbekannte ID mit festem Fehler ohne Aenderung oder Revalidierung ab", async () => {
    await geraetOhneBereiche();
    revalidiert.length = 0;
    const vorher = bzZeilen();

    const erg = await setGeraetAktiv({ id: "bz-fehlt", aktiv: false }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "BZ-Gerät nicht gefunden." });
    expect(bzZeilen()).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Statusfehler zurueck", async () => {
    const id = await geraetOhneBereiche();
    revalidiert.length = 0;
    t.sqlite.exec(`
      CREATE TRIGGER bz_geraete_update_defekt
      BEFORE UPDATE ON bz_geraete
      BEGIN
        SELECT RAISE(ABORT, 'STATUS_GEHEIMNIS');
      END;
    `);

    const erg = await setGeraetAktiv({ id, aktiv: false }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "BZ-Gerätestatus konnte nicht geändert werden.",
    });
    expect(fehlerVon(erg).fehler).not.toContain("STATUS_GEHEIMNIS");
    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });
});

describe("geraetZuBarcode", () => {
  it("findet raw und /g/-Deep-Links byte-exakt, bleibt bei kaputtem Prozent total und read-only", async () => {
    const klein = wertVon<{ id: string }>(await geraetSpeichern({
      name: "klein",
      lagerortId: "ort-aktiv",
      barcode: "bz-klein",
    }, t.db)).id;
    const prozent = wertVon<{ id: string }>(await geraetSpeichern({
      name: "prozent",
      lagerortId: "ort-aktiv",
      barcode: "BZ%ZZ",
    }, t.db)).id;
    revalidiert.length = 0;
    const aenderungenVorher = sqliteAenderungen();

    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("  bz-klein  ", t.db)))
      .toEqual({ id: klein });
    expect(wertVon<{ id: string } | null>(
      await geraetZuBarcode("https://lagerbuch.example/g/bz-klein?quelle=qr", t.db),
    )).toEqual({ id: klein });
    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("BZ-KLEIN", t.db)))
      .toBeNull();
    await expect(geraetZuBarcode("https://lagerbuch.example/g/BZ%ZZ", t.db))
      .resolves.toEqual({ ok: true, wert: { id: prozent } });
    expect(wertVon<{ id: string } | null>(await geraetZuBarcode("unbekannt", t.db)))
      .toBeNull();

    expect(sqliteAenderungen()).toBe(aenderungenVorher);
    expect(revalidiert).toEqual([]);
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Suchfehler zurueck", async () => {
    t.sqlite.exec("DROP TABLE bz_geraete");

    const erg = await geraetZuBarcode("BZ-1", t.db);

    expect(erg).toEqual({ ok: false, fehler: "BZ-Gerät konnte nicht gesucht werden." });
    expect(fehlerVon(erg).fehler).not.toMatch(/no such table|sqlite/i);
    expect(revalidiert).toEqual([]);
  });
});

describe("kontrolleErfassen", () => {
  it("schreibt Grenzurteile, Quelle und den exakten siebenfeldrigen Roh-Snapshot", async () => {
    const geraetId = await geraetMitBereichen();
    revalidiert.length = 0;

    const erg = await kontrolleErfassen({
      geraetId,
      level1Wert: 40,
      level2Wert: 350,
      kompresseVerfall: "2027-05",
      sticks: 25,
      lanzetten: 10,
      batterieGewechselt: true,
      kommentar: "  in Ordnung  ",
    }, t.db);
    const wert = wertVon<{ id: string; bestanden: boolean }>(erg);
    const kontrolle = t.db.select().from(bzKontrollen)
      .where(eq(bzKontrollen.id, wert.id)).get()!;

    expect(wert.bestanden).toBe(true);
    expect(kontrolle).toMatchObject({
      geraetId,
      quelleTyp: "oidc",
      quelleId: "u-admin",
      level1Wert: 40,
      level1ImBereich: true,
      level2Wert: 350,
      level2ImBereich: true,
      kompresseVerfall: "2027-05",
      sticks: 25,
      lanzetten: 10,
      batterieGewechselt: true,
      kommentar: "in Ordnung",
      bestanden: true,
      refSnapshot: REF_SNAPSHOT,
    });
    expect(kontrolle.refSnapshot).toBe(REF_SNAPSHOT);
    expect(revalidiert).toEqual(erwartetePfade(geraetId));
  });

  it("uebernimmt die Bewertung aus bewerteKontrolle statt Grenzen nachzubauen", async () => {
    const geraetId = await geraetMitBereichen();
    revalidiert.length = 0;
    bewertungOverride.current = {
      level1ImBereich: false,
      level2ImBereich: true,
      bestanden: true,
    };

    const erg = await kontrolleErfassen({
      geraetId,
      level1Wert: 999,
      level2Wert: 1,
    }, t.db);
    const wert = wertVon<{ id: string; bestanden: boolean }>(erg);

    expect(wert.bestanden).toBe(true);
    expect(t.db.select().from(bzKontrollen).where(eq(bzKontrollen.id, wert.id)).get())
      .toMatchObject({
        level1ImBereich: false,
        level2ImBereich: true,
        bestanden: true,
      });
  });

  it("laesst spaetere Referenz-Aenderungen den alten Roh-Snapshot nicht umschreiben", async () => {
    const geraetId = await geraetMitBereichen();
    const kontrolle = wertVon<{ id: string; bestanden: boolean }>(
      await kontrolleErfassen({
        geraetId,
        level1Wert: 50,
        level2Wert: 300,
      }, t.db),
    );
    const vorher = t.db.select().from(bzKontrollen)
      .where(eq(bzKontrollen.id, kontrolle.id)).get()!.refSnapshot;

    await geraetSpeichern({
      id: geraetId,
      name: "Accu-Chek neu",
      barcode: "BZ-1",
      lagerortId: "ort-aktiv",
      streifenLot: "LOT-B",
      level1Label: "L1 neu",
      level1Min: 100,
      level1Max: 200,
      level2Label: "L2 neu",
      level2Min: 500,
      level2Max: 600,
    }, t.db);

    expect(vorher).toBe(REF_SNAPSHOT);
    expect(t.db.select().from(bzKontrollen)
      .where(eq(bzKontrollen.id, kontrolle.id)).get()!.refSnapshot)
      .toBe(REF_SNAPSHOT);
  });

  it("nimmt eine komplett leere Kontrolle an, bewertet sie aber nicht als bestanden", async () => {
    const geraetId = await geraetOhneBereiche();
    revalidiert.length = 0;

    const erg = await kontrolleErfassen({ geraetId }, t.db);
    const wert = wertVon<{ id: string; bestanden: boolean }>(erg);

    expect(wert.bestanden).toBe(false);
    expect(t.db.select().from(bzKontrollen).where(eq(bzKontrollen.id, wert.id)).get())
      .toMatchObject({
        level1Wert: null,
        level1ImBereich: null,
        level2Wert: null,
        level2ImBereich: null,
        sticks: 0,
        lanzetten: 0,
        batterieGewechselt: false,
        bestanden: false,
      });
    expect(revalidiert).toEqual(erwartetePfade(geraetId));
  });

  it("bewertet ein konfiguriertes, aber ungemessenes Level als nicht bestanden", async () => {
    const geraetId = await geraetMitBereichen();
    revalidiert.length = 0;

    const erg = await kontrolleErfassen({
      geraetId,
      level1Wert: 50,
    }, t.db);
    const wert = wertVon<{ id: string; bestanden: boolean }>(erg);

    expect(wert.bestanden).toBe(false);
    expect(t.db.select().from(bzKontrollen).where(eq(bzKontrollen.id, wert.id)).get())
      .toMatchObject({
        level1ImBereich: true,
        level2Wert: null,
        level2ImBereich: null,
        bestanden: false,
      });
  });

  it("lehnt ein unbekanntes Geraet ohne Schreiben oder Revalidierung ab", async () => {
    const erg = await kontrolleErfassen({
      geraetId: "gibts-nicht",
      level1Wert: 50,
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Gerät nicht gefunden." });
    expect(kontrollZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt einen ungueltigen Kompressen-Verfall ohne Schreiben oder Revalidierung ab", async () => {
    const geraetId = await geraetOhneBereiche();
    revalidiert.length = 0;

    const erg = await kontrolleErfassen({
      geraetId,
      kompresseVerfall: "2027",
    }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg).feldFehler?.kompresseVerfall).toBe("Verfall muss YYYY-MM sein");
    expect(kontrollZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("schreibt nur INSERT-Zeilen, die von den Append-only-Triggern geschuetzt sind", async () => {
    const geraetId = await geraetOhneBereiche();
    const kontrolleId = wertVon<{ id: string; bestanden: boolean }>(
      await kontrolleErfassen({ geraetId, level1Wert: 1 }, t.db),
    ).id;

    expect(() => t.db.update(bzKontrollen)
      .set({ kommentar: "nachtraeglich" })
      .where(eq(bzKontrollen.id, kontrolleId))
      .run()).toThrow(/append-only/i);
    expect(() => t.db.delete(bzKontrollen)
      .where(eq(bzKontrollen.id, kontrolleId))
      .run()).toThrow(/append-only/i);
    expect(kontrollZeilen()).toHaveLength(1);
  });

  it("gibt bei einem Infrastrukturfehler nur den festen Kontrollfehler zurueck", async () => {
    const geraetId = await geraetOhneBereiche();
    revalidiert.length = 0;
    t.sqlite.exec(`
      CREATE TRIGGER bz_kontrollen_insert_defekt
      BEFORE INSERT ON bz_kontrollen
      BEGIN
        SELECT RAISE(ABORT, 'KONTROLLE_GEHEIMNIS');
      END;
    `);

    const erg = await kontrolleErfassen({ geraetId, level1Wert: 1 }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Kontrolle konnte nicht gespeichert werden." });
    expect(fehlerVon(erg).fehler).not.toContain("KONTROLLE_GEHEIMNIS");
    expect(kontrollZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});
