import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel,
  fahrzeugTemplates,
  lagerorte,
  lagerortVerfall,
  sollPositionen,
  templatePositionen,
} from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const { revalidiert, adminRiegel, ortLeseWirft } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  /** Schalter fuer den gesperrten Lesezugriff — siehe den Fall ganz unten. */
  ortLeseWirft: { an: false },
}));

/*
 * ⚠️ NUR `etikettOrt` WIRD UMGELENKT, und nur auf Zuruf. Die Datei prueft
 * ansonsten den echten Lesepfad; ein pauschaler Mock machte aus dem
 * Ortscode-Zweig von `createFahrzeug` eine Attrappe und die Zusicherungen
 * darueber wertlos.
 */
vi.mock("../_lib/lesepfade/ortEtiketten", async (echtes) => {
  const echt = await echtes<typeof import("../_lib/lesepfade/ortEtiketten")>();
  return {
    ...echt,
    etikettOrt: (...args: Parameters<typeof echt.etikettOrt>) => {
      if (ortLeseWirft.an) throw new Error("SQLITE_BUSY: database is locked");
      return echt.etikettOrt(...args);
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import {
  createFahrzeug,
  setEinheitenart,
  setFahrzeugAktiv,
  sollPositionEntfernen,
  sollPositionSetzen,
  sollPositionWiederherstellen,
} from "./fahrzeuge";

const JETZT = new Date("2026-06-15T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const FAHRZEUGE_PFAD = "/m/lagerbuch/verwaltung/fahrzeuge";
const VERFALL_PFAD = "/m/lagerbuch/verwaltung/verfall";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-fahrzeuge-");

  // Das Handlager kommt aus Migration 0003. Ein zweiter Insert waere kein
  // harmloses Fixture, sondern ein UNIQUE-Verstoss.
  expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get())
    .toMatchObject({ typ: "lager", aktiv: true });

  t.db.insert(fahrzeugTemplates).values({
    id: "tpl-1",
    name: "RTW-Vorlage",
    aktiv: true,
    createdAt: JETZT,
  }).run();
  t.db.insert(lagerorte).values([
    {
      id: "fz-1",
      name: "RTW 1",
      typ: "fahrzeug",
      kennung: "UE-RK 1234",
      aktiv: true,
      templateId: "tpl-1",
    },
    {
      id: "fz-2",
      name: "RTW 2",
      typ: "fahrzeug",
      kennung: null,
      aktiv: true,
      templateId: null,
    },
  ]).run();
  t.db.insert(artikel).values([
    {
      id: "art-1",
      name: "Mullbinde",
      einheit: "Stk.",
      fach: "A-01",
      mindestbestand: 5,
      aktiv: true,
      createdAt: JETZT,
    },
    {
      id: "art-2",
      name: "Wärmedecke",
      einheit: "Stk.",
      fach: "A-02",
      mindestbestand: 0,
      aktiv: true,
      createdAt: JETZT,
    },
  ]).run();
});

afterEach(() => {
  ortLeseWirft.an = false;
  t.schliessen();
  vi.clearAllMocks();
});

function wert<T>(ergebnis: unknown): T {
  return (ergebnis as { ok: true; wert: T }).wert;
}

function fehlerVon(ergebnis: unknown) {
  return ergebnis as { ok: false; fehler: string; feldFehler?: Record<string, string> };
}

function templatePositionAnlegen(
  id: string,
  artikelId = "art-1",
  werte: Partial<typeof templatePositionen.$inferInsert> = {},
) {
  t.db.insert(templatePositionen).values({
    id,
    templateId: "tpl-1",
    fachLabel: "Vorlagenfach",
    sort: 0,
    artikelId,
    soll: 2,
    ...werte,
  }).run();
}

function positionAnlegen(
  id: string,
  werte: Partial<typeof sollPositionen.$inferInsert> = {},
) {
  t.db.insert(sollPositionen).values({
    id,
    fahrzeugId: "fz-1",
    fachLabel: "Fach 1",
    sort: 0,
    artikelId: "art-1",
    soll: 2,
    templatePositionId: null,
    ueberschrieben: false,
    entfernt: false,
    ...werte,
  }).run();
}

function verfallAnlegen(id: string, fahrzeugId = "fz-1", artikelId = "art-1") {
  t.db.insert(lagerortVerfall).values({
    id,
    lagerortId: fahrzeugId,
    artikelId,
    verfall: "2027-03",
    erfasstAt: JETZT,
    quelleTyp: "oidc",
    quelleId: "u-admin",
  }).run();
}

function verfallFuer(fahrzeugId = "fz-1", artikelId = "art-1") {
  return t.db.select().from(lagerortVerfall).where(and(
    eq(lagerortVerfall.lagerortId, fahrzeugId),
    eq(lagerortVerfall.artikelId, artikelId),
  )).get();
}

describe("createFahrzeug", () => {
  it("legt genau ein aktives Fahrzeug mit getrimmten Feldern an und gibt dessen ID zurueck", async () => {
    const ergebnis = await createFahrzeug(
      { name: "  RTW 3  ", kennung: "  UE-RK 3000  ", einheitenart: "fahrzeug" },
      t.db,
    );

    expect(ergebnis.ok).toBe(true);
    const id = wert<{ id: string }>(ergebnis).id;
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()).toEqual({
      id,
      name: "RTW 3",
      typ: "fahrzeug",
      kennung: "UE-RK 3000",
      aktiv: true,
      templateId: null,
      parentId: null,
      zugangshinweis: null,
      sortierung: 0,
      einheitenart: "fahrzeug",
    });
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD]);
  });

  it("speichert eine fehlende oder leere Kennung als null", async () => {
    const ohne = await createFahrzeug(
      { name: "MTW", einheitenart: "fahrzeug" }, t.db);
    const leer = await createFahrzeug(
      { name: "KTW", kennung: "   ", einheitenart: "fahrzeug" }, t.db);

    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, wert<{ id: string }>(ohne).id)).get()?.kennung).toBeNull();
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, wert<{ id: string }>(leer).id)).get()?.kennung).toBeNull();
  });

  it("weist einen leeren Namen am Feld zurueck und schreibt oder revalidiert nichts", async () => {
    const vorher = t.db.select().from(lagerorte).all();

    const ergebnis = await createFahrzeug(
      { name: "   ", einheitenart: "fahrzeug" }, t.db);

    expect(fehlerVon(ergebnis)).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { name: "Name darf nicht leer sein" },
    });
    expect(t.db.select().from(lagerorte).all()).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("verbirgt einen Datenbankfehler hinter einem festen Fachtext", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER fahrzeug_create_fehler
      BEFORE INSERT ON lagerorte
      WHEN NEW.name = 'Defekt'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheime Fahrzeugmeldung');
      END;
    `);

    const ergebnis = await createFahrzeug(
      { name: "Defekt", einheitenart: "fahrzeug" }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Einheit konnte nicht angelegt werden." });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(revalidiert).toEqual([]);
  });

  /**
   * DIE EIGENTLICHE ZUSICHERUNG AUS DRK-309: „neue Objekte muessen
   * kategorisiert werden".
   *
   * ⚠️ SIE GEHOERT AN DIE ACTION, NICHT AN DEN DIALOG. Die Spalte ist
   * nullable (Migration 0010 backfillt bewusst nicht), die Pflicht traegt also
   * allein der Eingangsvalidator — und eine `required`-Regel in `NeuFahrzeug`
   * ist eine Zusicherung ueber EIN Formular, nicht ueber die Server Action.
   */
  it("legt OHNE Art nichts an — weder eine Tasche noch ein Fahrzeug", async () => {
    const vorher = t.db.select().from(lagerorte).all();

    const ergebnis = await createFahrzeug({ name: "Rucksack ohne Art" }, t.db);

    expect(fehlerVon(ergebnis)).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { einheitenart: "Fahrzeug oder Tasche wählen" },
    });
    expect(t.db.select().from(lagerorte).all()).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("nimmt kein erfundenes drittes Wort als Art an", async () => {
    const vorher = t.db.select().from(lagerorte).all();

    // „unbekannt" ist der naheliegende Griff, mit dem die Pflicht zu umgehen
    // waere — der Zwischenstand ist aber die ABWESENHEIT eines Wertes, kein
    // Wert (Begruendung an `EINHEITENARTEN`).
    for (const art of ["unbekannt", "anhaenger", "", null]) {
      const ergebnis = await createFahrzeug(
        { name: "Erfunden", einheitenart: art }, t.db);
      expect(ergebnis.ok).toBe(false);
    }
    expect(t.db.select().from(lagerorte).all()).toEqual(vorher);
    expect(revalidiert).toEqual([]);
  });

  it("legt eine TASCHE mit `typ: \"fahrzeug\"` an — sonst traegt sie keinen Bestand", async () => {
    // ⚠️ Das ist keine Verlegenheitsloesung, sondern das Modell: `typ` trennt
    // Ort von beweglichem Traeger, die Art trennt Traeger von Traeger. Ohne
    // den `typ` faende `findeFahrzeug` die Tasche nicht, und weder Soll noch
    // Check noch Buchung waeren fuer sie erreichbar.
    const ergebnis = await createFahrzeug(
      { name: "Sanitätstasche 2", einheitenart: "tasche" }, t.db);

    const zeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, wert<{ id: string }>(ergebnis).id)).get();
    expect(zeile?.typ).toBe("fahrzeug");
    expect(zeile?.einheitenart).toBe("tasche");
    expect(zeile?.aktiv).toBe(true);
  });
});

describe("setEinheitenart — der Weg aus dem Zwischenstand", () => {
  it("traegt die Art an einer nicht zugeordneten Einheit nach", async () => {
    t.db.insert(lagerorte).values({
      id: "alt-1", name: "Rucksack Betreuung", typ: "fahrzeug", aktiv: true,
    }).run();
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "alt-1")).get()?.einheitenart).toBeNull();

    const ergebnis = await setEinheitenart(
      { id: "alt-1", einheitenart: "tasche" }, t.db);

    expect(ergebnis.ok).toBe(true);
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "alt-1")).get()?.einheitenart).toBe("tasche");
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD, `${FAHRZEUGE_PFAD}/alt-1`]);
  });

  it("korrigiert auch eine bereits gesetzte Art", async () => {
    // Die erste Zuordnung nach der Migration ist eine Aussage aus dem
    // Gedaechtnis. Ohne Korrekturweg hiesse der einzige Ausweg „stilllegen und
    // neu anlegen" — und das verloere Soll, Bestand, Checks und Journal.
    t.db.insert(lagerorte).values({
      id: "alt-2", name: "Verwechselt", typ: "fahrzeug", aktiv: true,
      einheitenart: "fahrzeug",
    }).run();

    expect((await setEinheitenart({ id: "alt-2", einheitenart: "tasche" }, t.db)).ok)
      .toBe(true);
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "alt-2")).get()?.einheitenart).toBe("tasche");
  });

  it("nimmt `null` nicht an — der Zwischenstand ist nicht herstellbar", async () => {
    t.db.insert(lagerorte).values({
      id: "alt-3", name: "Bleibt Fahrzeug", typ: "fahrzeug", aktiv: true,
      einheitenart: "fahrzeug",
    }).run();

    const ergebnis = await setEinheitenart({ id: "alt-3", einheitenart: null }, t.db);

    expect(ergebnis.ok).toBe(false);
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "alt-3")).get()?.einheitenart).toBe("fahrzeug");
    expect(revalidiert).toEqual([]);
  });

  it("fasst einen LAGERORT nicht an, auch wenn seine ID stimmt", async () => {
    // ⚠️ Der Fremdschluessel auf `lagerorte.id` unterscheidet das Handlager
    // nicht von einem Fahrzeug — `findeFahrzeug` ist der Riegel, nicht er.
    const ergebnis = await setEinheitenart(
      { id: "handlager", einheitenart: "tasche" }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Einheit nicht gefunden." });
    expect(t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "handlager")).get()?.einheitenart).toBeNull();
    expect(revalidiert).toEqual([]);
  });
});

describe("setFahrzeugAktiv", () => {
  it("aendert nur aktiv am Ziel-Fahrzeug und revalidiert genau die Flotte", async () => {
    const vorher = t.db.select().from(lagerorte).where(eq(lagerorte.id, "fz-1")).get()!;

    const ergebnis = await setFahrzeugAktiv({ id: "fz-1", aktiv: false }, t.db);

    expect(ergebnis).toEqual({ ok: true });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "fz-1")).get()).toEqual({
      ...vorher,
      aktiv: false,
    });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "fz-2")).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD]);
  });

  it("weist eine ungueltige Eingabe ohne Mutation oder Revalidierung zurueck", async () => {
    const ergebnis = await setFahrzeugAktiv({ id: "fz-1", aktiv: "nein" }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "fz-1")).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });

  it("kann das feste Handlager nicht als Fahrzeug deaktivieren", async () => {
    const ergebnis = await setFahrzeugAktiv({ id: HANDLAGER_ID, aktiv: false }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Einheit nicht gefunden." });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get())
      .toMatchObject({ typ: "lager", aktiv: true });
    expect(revalidiert).toEqual([]);
  });

  it("verbirgt einen Datenbankfehler hinter einem festen Fachtext", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER fahrzeug_aktiv_fehler
      BEFORE UPDATE OF aktiv ON lagerorte
      WHEN OLD.id = 'fz-1'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheimer Aktivfehler');
      END;
    `);

    const ergebnis = await setFahrzeugAktiv({ id: "fz-1", aktiv: false }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Der Status konnte nicht geändert werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(revalidiert).toEqual([]);
  });
});

describe("sollPositionSetzen", () => {
  it("legt eine manuelle Position mit allen Feldern an und revalidiert Uebersicht und Detail", async () => {
    const ergebnis = await sollPositionSetzen({
      fahrzeugId: "fz-1",
      fachLabel: "  Fach 7  ",
      artikelId: "art-1",
      soll: "3",
      sort: "4",
    }, t.db);

    expect(ergebnis.ok).toBe(true);
    const id = wert<{ id: string }>(ergebnis).id;
    expect(t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get()).toEqual({
      id,
      fahrzeugId: "fz-1",
      fachLabel: "Fach 7",
      sort: 4,
      artikelId: "art-1",
      soll: 3,
      templatePositionId: null,
      ueberschrieben: false,
      entfernt: false,
    });
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD, `${FAHRZEUGE_PFAD}/fz-1`]);
  });

  it("aktualisiert eine manuelle Position in derselben Zeile", async () => {
    positionAnlegen("sp-manuell", { fachLabel: "Alt", soll: 1, sort: 0 });

    const ergebnis = await sollPositionSetzen({
      id: "sp-manuell",
      fahrzeugId: "fz-1",
      fachLabel: "Neu",
      artikelId: "art-2",
      soll: 8,
      sort: 9,
    }, t.db);

    expect(ergebnis).toEqual({ ok: true, wert: { id: "sp-manuell" } });
    expect(t.db.select().from(sollPositionen).all()).toEqual([{
      id: "sp-manuell",
      fahrzeugId: "fz-1",
      fachLabel: "Neu",
      sort: 9,
      artikelId: "art-2",
      soll: 8,
      templatePositionId: null,
      ueberschrieben: false,
      entfernt: false,
    }]);
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD, `${FAHRZEUGE_PFAD}/fz-1`]);
  });

  it("markiert eine bearbeitete Vorlagen-Position als manuell ueberschrieben", async () => {
    templatePositionAnlegen("tp-1");
    positionAnlegen("sp-vorlage", { templatePositionId: "tp-1" });

    await sollPositionSetzen({
      id: "sp-vorlage",
      fahrzeugId: "fz-1",
      fachLabel: "Eigenes Fach",
      artikelId: "art-1",
      soll: 9,
      sort: 3,
    }, t.db);

    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-vorlage")).get()).toMatchObject({
      id: "sp-vorlage",
      templatePositionId: "tp-1",
      fachLabel: "Eigenes Fach",
      soll: 9,
      sort: 3,
      ueberschrieben: true,
      entfernt: false,
    });
  });

  it("belebt einen Vorlagen-Grabstein beim Setzen wieder", async () => {
    templatePositionAnlegen("tp-tot");
    positionAnlegen("sp-tot", {
      templatePositionId: "tp-tot",
      ueberschrieben: false,
      entfernt: true,
    });

    await sollPositionSetzen({
      id: "sp-tot",
      fahrzeugId: "fz-1",
      fachLabel: "Vorlagenfach",
      artikelId: "art-1",
      soll: 2,
    }, t.db);

    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-tot")).get()).toMatchObject({
      templatePositionId: "tp-tot",
      ueberschrieben: true,
      entfernt: false,
    });
  });

  it("weist soll kleiner gleich null am Feld zurueck und schreibt oder revalidiert nichts", async () => {
    const ergebnis = await sollPositionSetzen({
      fahrzeugId: "fz-1",
      fachLabel: "Fach",
      artikelId: "art-1",
      soll: 0,
    }, t.db);

    expect(fehlerVon(ergebnis)).toEqual({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { soll: "Soll muss größer als 0 sein" },
    });
    expect(t.db.select().from(sollPositionen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("legt keine Sollposition am Handlager an", async () => {
    const ergebnis = await sollPositionSetzen({
      fahrzeugId: HANDLAGER_ID,
      fachLabel: "Kein Fahrzeugfach",
      artikelId: "art-1",
      soll: 2,
    }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Einheit nicht gefunden." });
    expect(t.db.select().from(sollPositionen).all()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("verschiebt eine bestehende Position nicht per fremder fahrzeugId", async () => {
    positionAnlegen("sp-fz-1");

    const ergebnis = await sollPositionSetzen({
      id: "sp-fz-1",
      fahrzeugId: "fz-2",
      fachLabel: "Fremdes Fach",
      artikelId: "art-1",
      soll: 9,
    }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Soll-Position nicht gefunden." });
    expect(t.db.select().from(sollPositionen).all()).toEqual([
      expect.objectContaining({ id: "sp-fz-1", fahrzeugId: "fz-1", soll: 2 }),
    ]);
    expect(revalidiert).toEqual([]);
  });

  it("verbirgt einen Datenbankfehler hinter einem festen Fachtext", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER soll_speichern_fehler
      BEFORE INSERT ON soll_positionen
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheime Sollmeldung');
      END;
    `);

    const ergebnis = await sollPositionSetzen({
      fahrzeugId: "fz-1",
      fachLabel: "Fach",
      artikelId: "art-1",
      soll: 1,
    }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Soll-Position konnte nicht gespeichert werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(revalidiert).toEqual([]);
  });
});

describe("sollPositionEntfernen", () => {
  it("laesst eine Vorlagen-Position als Grabstein mit erhaltener Verknuepfung stehen", async () => {
    templatePositionAnlegen("tp-1");
    positionAnlegen("sp-vorlage", { templatePositionId: "tp-1" });

    const ergebnis = await sollPositionEntfernen({ id: "sp-vorlage" }, t.db);

    expect(ergebnis).toEqual({ ok: true });
    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-vorlage")).get()).toEqual({
      id: "sp-vorlage",
      fahrzeugId: "fz-1",
      fachLabel: "Fach 1",
      sort: 0,
      artikelId: "art-1",
      soll: 2,
      templatePositionId: "tp-1",
      ueberschrieben: false,
      entfernt: true,
    });
  });

  it("loescht eine manuelle Position hart", async () => {
    positionAnlegen("sp-manuell");

    await sollPositionEntfernen({ id: "sp-manuell" }, t.db);

    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-manuell")).get()).toBeUndefined();
  });

  it("loescht die Verfall-Angabe, wenn keine aktive Position dieses Artikels bleibt", async () => {
    positionAnlegen("sp-letzte");
    verfallAnlegen("lv-letzte");
    revalidiert.length = 0;

    await sollPositionEntfernen({ id: "sp-letzte" }, t.db);

    expect(verfallFuer()).toBeUndefined();
    expect(revalidiert).toEqual([
      `${FAHRZEUGE_PFAD}/fz-1`,
      VERFALL_PFAD,
      FAHRZEUGE_PFAD,
    ]);
  });

  it("behaelt die Verfall-Angabe bei einer weiteren aktiven Position in einem anderen Fach", async () => {
    positionAnlegen("sp-weg", { fachLabel: "Fach 1" });
    positionAnlegen("sp-bleibt", { fachLabel: "Fach 2", soll: 1 });
    verfallAnlegen("lv-bleibt");

    await sollPositionEntfernen({ id: "sp-weg" }, t.db);

    expect(verfallFuer()).toMatchObject({ id: "lv-bleibt", verfall: "2027-03" });
  });

  it("zaehlt einen Grabstein nicht als verbleibende Position", async () => {
    templatePositionAnlegen("tp-tot");
    positionAnlegen("sp-weg", { fachLabel: "Fach 1" });
    positionAnlegen("sp-tot", {
      fachLabel: "Fach 2",
      templatePositionId: "tp-tot",
      entfernt: true,
    });
    verfallAnlegen("lv-trotz-grabstein");

    await sollPositionEntfernen({ id: "sp-weg" }, t.db);

    expect(verfallFuer()).toBeUndefined();
    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-tot")).get()?.entfernt).toBe(true);
  });

  it("revalidiert keinen erfundenen Detailpfad, wenn die Position nicht existiert", async () => {
    const ergebnis = await sollPositionEntfernen({ id: "nicht-vorhanden" }, t.db);

    expect(ergebnis).toEqual({ ok: true });
    expect(revalidiert).toEqual([VERFALL_PFAD, FAHRZEUGE_PFAD]);
  });

  it("weist eine ungueltige ID ohne Mutation oder Revalidierung zurueck", async () => {
    positionAnlegen("sp-bleibt");

    const ergebnis = await sollPositionEntfernen({ id: "" }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(t.db.select().from(sollPositionen).all()).toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("verbirgt einen Datenbankfehler hinter einem festen Fachtext", async () => {
    positionAnlegen("sp-defekt");
    t.sqlite.exec(`
      CREATE TRIGGER soll_entfernen_fehler
      BEFORE DELETE ON soll_positionen
      WHEN OLD.id = 'sp-defekt'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheimer Loeschfehler');
      END;
    `);

    const ergebnis = await sollPositionEntfernen({ id: "sp-defekt" }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Soll-Position konnte nicht entfernt werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(revalidiert).toEqual([]);
  });
});

describe("sollPositionWiederherstellen", () => {
  it("hebt den Grabstein auf und revalidiert Detail und Uebersicht", async () => {
    templatePositionAnlegen("tp-tot");
    positionAnlegen("sp-tot", {
      templatePositionId: "tp-tot",
      entfernt: true,
    });

    const ergebnis = await sollPositionWiederherstellen({ id: "sp-tot" }, t.db);

    expect(ergebnis).toEqual({ ok: true });
    expect(t.db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, "sp-tot")).get()).toMatchObject({
      id: "sp-tot",
      templatePositionId: "tp-tot",
      entfernt: false,
    });
    expect(revalidiert).toEqual([`${FAHRZEUGE_PFAD}/fz-1`, FAHRZEUGE_PFAD]);
  });

  it("revalidiert keinen erfundenen Detailpfad, wenn die Position nicht existiert", async () => {
    const ergebnis = await sollPositionWiederherstellen({ id: "nicht-vorhanden" }, t.db);

    expect(ergebnis).toEqual({ ok: true });
    expect(revalidiert).toEqual([FAHRZEUGE_PFAD]);
  });

  it("verbirgt einen Datenbankfehler hinter einem festen Fachtext", async () => {
    templatePositionAnlegen("tp-defekt");
    positionAnlegen("sp-defekt", {
      templatePositionId: "tp-defekt",
      entfernt: true,
    });
    t.sqlite.exec(`
      CREATE TRIGGER soll_wiederherstellen_fehler
      BEFORE UPDATE OF entfernt ON soll_positionen
      WHEN OLD.id = 'sp-defekt'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheimer Restorefehler');
      END;
    `);

    const ergebnis = await sollPositionWiederherstellen({ id: "sp-defekt" }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Soll-Position konnte nicht wiederhergestellt werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(revalidiert).toEqual([]);
  });
});

/**
 * DIE EINHEIT UEBERLEBT EINEN FEHLGESCHLAGENEN ORTSCODE — DRK-406, gefunden in
 * der Durchsicht.
 *
 * ⚠️ `stelleOrtCodeSicher` WIRFT NIE, `etikettOrt` SEHR WOHL. Der zweite ist ein
 * gewoehnlicher Lesezugriff, und er laeuft unmittelbar nach dem `insert` der
 * Einheit — also genau dann, wenn der Schreiber die Datenbank noch haelt. Stand
 * er ausserhalb des `try`, brach sein Wurf die ganze Aktion ab, NACHDEM die
 * Einheit in der Datenbank stand: die Bedienende sah „Einheit konnte nicht
 * angelegt werden", legte sie erneut an und hatte sie danach zweimal.
 *
 * Der Code ist die Beigabe, die Einheit ist das, was jemand wollte — den Code
 * holt der Nachzug beim naechsten Oeffnen der Ortsetiketten.
 */
describe("createFahrzeug — ein gesperrter Lesezugriff nimmt die Einheit nicht zurueck", () => {
  it("meldet Erfolg und laesst die Einheit stehen, auch ohne Ortscode", async () => {
    ortLeseWirft.an = true;

    const ergebnis = await createFahrzeug(
      { name: "RTW 9", kennung: "UE-RK 9000", einheitenart: "fahrzeug" },
      t.db,
    );

    expect(ergebnis.ok, "der Wurf des Lesepfads darf nicht durchschlagen").toBe(true);
    const id = wert<{ id: string }>(ergebnis).id;
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()?.name)
      .toBe("RTW 9");
  });
});
