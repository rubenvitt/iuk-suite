import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel,
  buchungen,
  bzGeraete,
  bzKontrollen,
  chargen,
  checks,
  fahrzeugTemplates,
  geraete,
  lagerorte,
  lagerortVerfall,
  newId,
  o2Flaschen,
  o2Messungen,
  sollPositionen,
  templatePositionen,
  tokens,
} from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { ELEMENT_ARTEN, type ElementArt, type Loeschbarkeit } from "../_lib/loeschen";
import { TOKEN_LOESCHGRUND } from "../_lib/tokenForm";

const { revalidiert, adminRiegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import * as loeschActions from "./loeschen";

const {
  pruefeLoeschbar,
  loescheElement,
  deaktiviereElement,
} = loeschActions;

const QUELLE = "src/app/m/lagerbuch/_actions/loeschen.ts";
const JETZT = new Date("2026-06-15T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const FESTER_LOESCHFEHLER =
  "Dieser Eintrag hängt noch an anderen Daten und kann nicht gelöscht werden.";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-loeschen-");

  // Das Handlager ist eine Migrationszeile. Ein Test-Insert wuerde die reale
  // Schutzkante durch einen UNIQUE-Fehler ersetzen.
  expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get())
    .toMatchObject({ name: "Handlager", typ: "lager", aktiv: true });
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function wert<T>(ergebnis: unknown): T {
  return (ergebnis as { ok: true; wert: T }).wert;
}

function fehlerVon(ergebnis: unknown): { ok: false; fehler: string } {
  return ergebnis as { ok: false; fehler: string };
}

function artikelAnlegen(id = "art-1"): string {
  t.db.insert(artikel).values({
    id,
    name: "Mullbinde",
    einheit: "Stk.",
    fach: "A-01",
    mindestbestand: 5,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  return id;
}

function fahrzeugAnlegen(id = "fz-1"): string {
  t.db.insert(lagerorte).values({
    id,
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
  }).run();
  return id;
}

function chargeAnlegen(artikelId: string, id = newId()): string {
  t.db.insert(chargen).values({
    id,
    artikelId,
    chargenNr: "L-1",
    verfall: "2027-03",
    createdAt: JETZT,
  }).run();
  return id;
}

function buchungAnlegen(args: {
  artikelId: string;
  lagerortId?: string;
  quelleTyp?: "token" | "oidc" | "system";
  quelleId?: string;
}): void {
  const chargeId = chargeAnlegen(args.artikelId);
  t.db.insert(buchungen).values({
    id: newId(),
    ts: JETZT,
    typ: "zugang",
    artikelId: args.artikelId,
    chargeId,
    lagerortId: args.lagerortId ?? HANDLAGER_ID,
    menge: 2,
    quelleTyp: args.quelleTyp ?? "oidc",
    quelleId: args.quelleId ?? "u-admin",
    referenz: null,
    kommentar: null,
  }).run();
}

function sollPositionAnlegen(artikelId: string, fahrzeugId: string): void {
  t.db.insert(sollPositionen).values({
    id: newId(),
    fahrzeugId,
    fachLabel: "Fach 1",
    sort: 0,
    artikelId,
    soll: 2,
    templatePositionId: null,
    ueberschrieben: false,
    entfernt: false,
  }).run();
}

function templatePositionAnlegen(artikelId: string): void {
  const templateId = newId();
  t.db.insert(fahrzeugTemplates).values({
    id: templateId,
    name: "RTW-Vorlage",
    aktiv: true,
    createdAt: JETZT,
  }).run();
  t.db.insert(templatePositionen).values({
    id: newId(),
    templateId,
    fachLabel: "Vorlagenfach",
    sort: 0,
    artikelId,
    soll: 2,
  }).run();
}

function tokenAnlegen(args: {
  id?: string;
  code?: string;
  zielTyp?: "fahrzeug" | "artikel" | null;
  zielId?: string | null;
  scopeLagerortId?: string | null;
  lastUsedAt?: Date | null;
} = {}): string {
  const id = args.id ?? newId();
  t.db.insert(tokens).values({
    id,
    code: args.code ?? "111-111",
    label: "Zugangs-Code",
    scopeLagerortId: args.scopeLagerortId ?? null,
    zielTyp: args.zielTyp ?? null,
    zielId: args.zielId ?? null,
    aktiv: true,
    createdAt: JETZT,
    createdBy: "u-admin",
    lastUsedAt: args.lastUsedAt ?? null,
  }).run();
  return id;
}

function checkAnlegen(fahrzeugId: string, ergebnis: string | null = null): void {
  t.db.insert(checks).values({
    id: newId(),
    fahrzeugId,
    quelleTyp: "oidc",
    quelleId: "u-admin",
    startedAt: JETZT,
    completedAt: JETZT,
    ergebnis,
  }).run();
}

function bzGeraetAnlegen(lagerortId: string, id = newId()): string {
  t.db.insert(bzGeraete).values({
    id,
    name: "BZ-Gerät",
    lagerortId,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  return id;
}

function geraetAnlegen(lagerortId: string, id = newId()): string {
  t.db.insert(geraete).values({
    id,
    typ: "objekt",
    name: "Spineboard",
    lagerortId,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  return id;
}

function o2FlascheAnlegen(lagerortId: string, id = newId()): string {
  t.db.insert(o2Flaschen).values({
    id,
    name: "O₂-Flasche",
    lagerortId,
    nennfuelldruckBar: 200,
    aktiv: true,
    createdAt: JETZT,
  }).run();
  return id;
}

function verfallAnlegen(artikelId: string, lagerortId: string, id = newId()): string {
  t.db.insert(lagerortVerfall).values({
    id,
    lagerortId,
    artikelId,
    verfall: "2027-03",
    erfasstAt: JETZT,
    quelleTyp: "oidc",
    quelleId: "u-admin",
  }).run();
  return id;
}

function elementAnlegen(art: ElementArt): string {
  switch (art) {
    case "artikel": return artikelAnlegen("element-artikel");
    case "fahrzeug": return fahrzeugAnlegen("element-fahrzeug");
    case "token": return tokenAnlegen({ id: "element-token", code: "222-222" });
    case "bzGeraet": return bzGeraetAnlegen(fahrzeugAnlegen("lager-bz"), "element-bz");
    case "o2Flasche": return o2FlascheAnlegen(fahrzeugAnlegen("lager-o2"), "element-o2");
    case "geraet": return geraetAnlegen(fahrzeugAnlegen("lager-geraet"), "element-geraet");
  }
}

function elementVorhanden(art: ElementArt, id: string): boolean {
  switch (art) {
    case "artikel": return Boolean(t.db.select().from(artikel).where(eq(artikel.id, id)).get());
    case "fahrzeug": return Boolean(t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get());
    case "token": return Boolean(t.db.select().from(tokens).where(eq(tokens.id, id)).get());
    case "bzGeraet": return Boolean(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get());
    case "o2Flasche": return Boolean(t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get());
    case "geraet": return Boolean(t.db.select().from(geraete).where(eq(geraete.id, id)).get());
  }
}

function elementAktiv(art: ElementArt, id: string): boolean | undefined {
  switch (art) {
    case "artikel": return t.db.select().from(artikel).where(eq(artikel.id, id)).get()?.aktiv;
    case "fahrzeug": return t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()?.aktiv;
    case "token": return t.db.select().from(tokens).where(eq(tokens.id, id)).get()?.aktiv;
    case "bzGeraet": return t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()?.aktiv;
    case "o2Flasche": return t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get()?.aktiv;
    case "geraet": return t.db.select().from(geraete).where(eq(geraete.id, id)).get()?.aktiv;
  }
}

function erwarteBlockiert(ergebnis: unknown, grundTeil: string): void {
  expect(ergebnis).toMatchObject({ ok: true });
  const status = wert<Loeschbarkeit>(ergebnis);
  expect(status).toMatchObject({
    loeschbar: false,
    kannDeaktivieren: true,
  });
  if (!status.loeschbar) expect(status.grund).toContain(grundTeil);
  expect(revalidiert).toEqual([]);
}

describe("Action-Vertrag", () => {
  it("exportiert genau die drei benannten Runtime-Actions", () => {
    expect(Object.keys(loeschActions).sort()).toEqual([
      "deaktiviereElement",
      "loescheElement",
      "pruefeLoeschbar",
    ]);
    expect([...ELEMENT_ARTEN]).toEqual([
      "artikel",
      "fahrzeug",
      "token",
      "bzGeraet",
      "o2Flasche",
      "geraet",
    ]);
  });

  it.each([
    ["pruefeLoeschbar", () => pruefeLoeschbar("ungueltig" as ElementArt, "", t.db)],
    ["loescheElement", () => loescheElement("ungueltig" as ElementArt, "", t.db)],
    ["deaktiviereElement", () => deaktiviereElement("ungueltig" as ElementArt, "", t.db)],
  ])("%s fuehrt den Admin-Riegel vor der Validierung aus", async (_name, aufruf) => {
    adminRiegel.mockRejectedValueOnce(new Error("kein Lagerbuch-Admin"));

    await expect(aufruf()).rejects.toThrow("kein Lagerbuch-Admin");
    expect(revalidiert).toEqual([]);
  });

  it.each([
    ["pruefeLoeschbar", () => pruefeLoeschbar("ungueltig" as ElementArt, "", t.db)],
    ["loescheElement", () => loescheElement("ungueltig" as ElementArt, "", t.db)],
    ["deaktiviereElement", () => deaktiviereElement("ungueltig" as ElementArt, "", t.db)],
  ])("%s weist ungueltige Nutzlast ohne Revalidierung zurueck", async (_name, aufruf) => {
    expect(await aufruf()).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(revalidiert).toEqual([]);
  });
});

describe("pruefeLoeschbar — Artikel", () => {
  it("meldet einen unberuehrten Artikel als loeschbar und revalidiert nichts", async () => {
    const id = artikelAnlegen();

    expect(await pruefeLoeschbar("artikel", id, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });
    expect(revalidiert).toEqual([]);
  });

  it.each([
    {
      name: "Charge",
      grund: "1 Charge",
      anlegen: (artikelId: string) => { chargeAnlegen(artikelId); },
    },
    {
      name: "Buchung",
      grund: "1 Buchung",
      anlegen: (artikelId: string) => { buchungAnlegen({ artikelId }); },
    },
    {
      name: "Soll-Position",
      grund: "1 Soll-Position",
      anlegen: (artikelId: string) => { sollPositionAnlegen(artikelId, fahrzeugAnlegen()); },
    },
    {
      name: "Vorlagen-Position",
      grund: "1 Vorlagen-Position",
      anlegen: (artikelId: string) => { templatePositionAnlegen(artikelId); },
    },
    {
      name: "passender Zugangs-Code",
      grund: "1 Zugangs-Code",
      anlegen: (artikelId: string) => {
        tokenAnlegen({ zielTyp: "artikel", zielId: artikelId });
      },
    },
  ])("blockiert einen Artikel, der nur durch $name referenziert ist", async ({ grund, anlegen }) => {
    const id = artikelAnlegen();
    anlegen(id);

    erwarteBlockiert(await pruefeLoeschbar("artikel", id, t.db), grund);
  });

  it("zaehlt zielId nur zusammen mit zielTyp=artikel", async () => {
    const id = artikelAnlegen();
    tokenAnlegen({ zielTyp: "fahrzeug", zielId: id });

    expect(await pruefeLoeschbar("artikel", id, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });
    expect(revalidiert).toEqual([]);
  });
});

describe("pruefeLoeschbar — Fahrzeug", () => {
  it.each([
    {
      name: "Buchung",
      grund: "1 Buchung",
      anlegen: (fahrzeugId: string) => {
        buchungAnlegen({ artikelId: artikelAnlegen(), lagerortId: fahrzeugId });
      },
    },
    {
      name: "Soll-Position",
      grund: "1 Soll-Position",
      anlegen: (fahrzeugId: string) => {
        sollPositionAnlegen(artikelAnlegen(), fahrzeugId);
      },
    },
    {
      name: "Check",
      grund: "1 Check",
      anlegen: (fahrzeugId: string) => { checkAnlegen(fahrzeugId); },
    },
    {
      name: "BZ-Gerät",
      grund: "1 BZ-Gerät",
      anlegen: (fahrzeugId: string) => { bzGeraetAnlegen(fahrzeugId); },
    },
    {
      name: "generisches Gerät",
      grund: "1 Gerät",
      anlegen: (fahrzeugId: string) => { geraetAnlegen(fahrzeugId); },
    },
    {
      name: "O₂-Flasche",
      grund: "1 O₂-Flasche",
      anlegen: (fahrzeugId: string) => { o2FlascheAnlegen(fahrzeugId); },
    },
    {
      name: "passender Zugangs-Code",
      grund: "1 Zugangs-Code",
      anlegen: (fahrzeugId: string) => {
        tokenAnlegen({ zielTyp: "fahrzeug", zielId: fahrzeugId });
      },
    },
  ])("blockiert ein Fahrzeug, das nur durch $name referenziert ist", async ({ grund, anlegen }) => {
    const id = fahrzeugAnlegen();
    anlegen(id);

    erwarteBlockiert(await pruefeLoeschbar("fahrzeug", id, t.db), grund);
  });

  it("zaehlt zielId nur zusammen mit zielTyp=fahrzeug", async () => {
    const id = fahrzeugAnlegen();
    tokenAnlegen({ zielTyp: "artikel", zielId: id });

    expect(await pruefeLoeschbar("fahrzeug", id, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });
    expect(revalidiert).toEqual([]);
  });

  it("ignoriert die tote scopeLagerortId-Spalte bei der Vorpruefung", async () => {
    const id = fahrzeugAnlegen();
    tokenAnlegen({ scopeLagerortId: id });

    expect(await pruefeLoeschbar("fahrzeug", id, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });
    expect(revalidiert).toEqual([]);
  });
});

describe("pruefeLoeschbar — Historien der uebrigen Arten", () => {
  /**
   * ⚠️ BIS T160 stand hier „blockiert einen benutzten Zugangs-Code anhand
   * seiner Token-Buchungen" mit der Erwartung „1 Buchung". Das Praedikat war:
   * loeschbar, solange NULL Buchungen mit `quelleTyp="token"` auf den `code`
   * zeigen (`pruefeToken`, bis T160 in `loeschen.ts:126-143`).
   *
   * ENTSCHEIDUNG 8-F hat genau dieses Praedikat abgeschafft, weil es der
   * einzige Weg war, auf dem ein Code wieder frei werden konnte: nie eingeloest
   * ⇒ keine Buchung ⇒ loeschbar ⇒ Code frei ⇒ ein spaeter ausgestelltes
   * Kaertchen erbt ihn, und historische Journalzeilen erscheinen unter dem
   * NEUEN Label (`tokens.code` ist zugleich der Anzeigeschluessel, 1:1-Pflicht 6).
   *
   * Die Buchungshistorie bleibt der GRUND, aber sie ist nicht mehr die
   * BEDINGUNG — die Ablehnung ist jetzt unbedingt.
   */
  it("blockiert einen Zugangs-Code unabhaengig von seinen Buchungen", async () => {
    const tokenId = tokenAnlegen({ code: "333-333" });
    buchungAnlegen({
      artikelId: artikelAnlegen(),
      quelleTyp: "token",
      quelleId: "333-333",
    });

    erwarteBlockiert(await pruefeLoeschbar("token", tokenId, t.db), "sperren");
  });

  it("blockiert ein BZ-Geraet mit Kontrolle", async () => {
    const geraetId = bzGeraetAnlegen(fahrzeugAnlegen());
    t.db.insert(bzKontrollen).values({
      id: newId(),
      geraetId,
      ts: JETZT,
      quelleTyp: "oidc",
      quelleId: "u-admin",
      bestanden: true,
    }).run();

    erwarteBlockiert(await pruefeLoeschbar("bzGeraet", geraetId, t.db), "1 Kontrolle");
  });

  it("blockiert eine O₂-Flasche mit Messung", async () => {
    const flascheId = o2FlascheAnlegen(fahrzeugAnlegen());
    t.db.insert(o2Messungen).values({
      id: newId(),
      flascheId,
      ts: JETZT,
      druckBar: 150,
      quelleTyp: "oidc",
      quelleId: "u-admin",
      kommentar: null,
    }).run();

    erwarteBlockiert(await pruefeLoeschbar("o2Flasche", flascheId, t.db), "1 Messung");
  });

  it("wertet V1 und kaputtes Check-JSON tolerant aus und zaehlt nur die V2-Geraetereferenz", async () => {
    const fahrzeugId = fahrzeugAnlegen();
    const geraetId = geraetAnlegen(fahrzeugId);
    checkAnlegen(fahrzeugId, JSON.stringify([{ fehlt: 1, gebucht: 0 }]));
    checkAnlegen(fahrzeugId, "{kaputtes json");
    checkAnlegen(fahrzeugId, JSON.stringify({
      positionen: [],
      artikel: [],
      geraete: [{
        geraetId,
        vorhanden: true,
        zustand: "In Ordnung",
        bemerkung: null,
      }],
      flaschen: [],
      verfall: [],
    }));

    erwarteBlockiert(await pruefeLoeschbar("geraet", geraetId, t.db), "1 Check");
  });
});

const REVALIDIERUNG: { art: ElementArt; pfade: string[] }[] = [
  {
    art: "artikel",
    pfade: ["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"],
  },
  {
    art: "fahrzeug",
    pfade: ["/m/lagerbuch/verwaltung/fahrzeuge", "/m/lagerbuch/verwaltung"],
  },
  { art: "token", pfade: ["/m/lagerbuch/verwaltung/tokens"] },
  { art: "bzGeraet", pfade: ["/m/lagerbuch/verwaltung/bz"] },
  { art: "o2Flasche", pfade: ["/m/lagerbuch/verwaltung/sauerstoff"] },
  { art: "geraet", pfade: ["/m/lagerbuch/verwaltung/geraete"] },
];

/**
 * ENTSCHEIDUNG 8-F: `token` faellt aus der HART-Tabelle heraus — und nur dort.
 * `deaktiviereElement` behaelt alle sechs Arten (der Sperrweg ist der Ausgang,
 * den 8-F stehen laesst), deshalb wird die Tabelle gefiltert statt gespalten:
 * eine zweite Abschrift der fuenf Pfadlisten ginge beim naechsten Pfadwechsel
 * still auseinander.
 */
const HART_LOESCHBAR = REVALIDIERUNG.filter(({ art }) => art !== "token");

describe("loescheElement — fuenf hart loeschbare Arten und eine Revalidierungstabelle", () => {
  it("laesst genau eine der sechs Arten aus dem Hard-Delete heraus", () => {
    expect(HART_LOESCHBAR).toHaveLength(5);
    expect(HART_LOESCHBAR.map(({ art }) => art)).not.toContain("token");
  });

  it.each(HART_LOESCHBAR)("loescht $art hart und revalidiert exakt dessen Pfade", async ({ art, pfade }) => {
    const id = elementAnlegen(art);

    expect(await loescheElement(art, id, t.db)).toEqual({ ok: true });
    expect(elementVorhanden(art, id)).toBe(false);
    expect(revalidiert).toEqual(pfade);
  });

  it("raeumt gemeldeten Verfall beim Artikel-Hard-Delete in derselben Operation weg", async () => {
    const artikelId = artikelAnlegen();
    const fahrzeugId = fahrzeugAnlegen();
    verfallAnlegen(artikelId, fahrzeugId, "verfall-artikel");

    expect(await loescheElement("artikel", artikelId, t.db)).toEqual({ ok: true });
    expect(t.db.select().from(artikel).where(eq(artikel.id, artikelId)).get()).toBeUndefined();
    expect(t.db.select().from(lagerortVerfall)
      .where(eq(lagerortVerfall.id, "verfall-artikel")).get()).toBeUndefined();
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get()).toBeDefined();
  });

  it("raeumt gemeldeten Verfall beim Fahrzeug-Hard-Delete in derselben Operation weg", async () => {
    const artikelId = artikelAnlegen();
    const fahrzeugId = fahrzeugAnlegen();
    verfallAnlegen(artikelId, fahrzeugId, "verfall-fahrzeug");

    expect(await loescheElement("fahrzeug", fahrzeugId, t.db)).toEqual({ ok: true });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get()).toBeUndefined();
    expect(t.db.select().from(lagerortVerfall)
      .where(eq(lagerortVerfall.id, "verfall-fahrzeug")).get()).toBeUndefined();
    expect(t.db.select().from(artikel).where(eq(artikel.id, artikelId)).get()).toBeDefined();
  });

  it("wiederholt die Dialog-Pruefung unmittelbar vor dem Loeschen", async () => {
    const artikelId = artikelAnlegen();
    expect(await pruefeLoeschbar("artikel", artikelId, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });

    // Zwischen Dialog-Oeffnen und Klick entsteht ein echter neuer Blocker.
    chargeAnlegen(artikelId);
    const ergebnis = await loescheElement("artikel", artikelId, t.db);

    expect(fehlerVon(ergebnis).fehler).toContain("Charge");
    expect(t.db.select().from(artikel).where(eq(artikel.id, artikelId)).get()).toBeDefined();
    expect(revalidiert).toEqual([]);
  });

  it("rollt Verfall-Cleanup bei einem spaeten Delete-Fehler zurueck und verbirgt SQLite-Text", async () => {
    const artikelId = artikelAnlegen("art-trigger");
    const fahrzeugId = fahrzeugAnlegen();
    verfallAnlegen(artikelId, fahrzeugId, "verfall-trigger");
    t.sqlite.exec(`
      CREATE TRIGGER artikel_delete_fehler
      BEFORE DELETE ON artikel
      WHEN OLD.id = 'art-trigger'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheimer Triggertext');
      END;
    `);

    const ergebnis = await loescheElement("artikel", artikelId, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: FESTER_LOESCHFEHLER });
    expect(fehlerVon(ergebnis).fehler).not.toContain("db-intern");
    expect(fehlerVon(ergebnis).fehler).not.toContain("SQLite");
    expect(t.db.select().from(artikel).where(eq(artikel.id, artikelId)).get()).toBeDefined();
    expect(t.db.select().from(lagerortVerfall)
      .where(eq(lagerortVerfall.id, "verfall-trigger")).get()).toBeDefined();
    expect(revalidiert).toEqual([]);
  });

  it("faengt auch einen verbliebenen scopeLagerortId-Fremdschluessel freundlich ab", async () => {
    const fahrzeugId = fahrzeugAnlegen();
    tokenAnlegen({ scopeLagerortId: fahrzeugId });

    const ergebnis = await loescheElement("fahrzeug", fahrzeugId, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: FESTER_LOESCHFEHLER });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get()).toBeDefined();
    expect(revalidiert).toEqual([]);
  });

  it("loescht das migrierte Handlager nie hart", async () => {
    const status = wert<Loeschbarkeit>(
      await pruefeLoeschbar("fahrzeug", HANDLAGER_ID, t.db),
    );
    expect(status).toMatchObject({ loeschbar: false, kannDeaktivieren: false });

    const ergebnis = await loescheElement("fahrzeug", HANDLAGER_ID, t.db);

    expect(ergebnis.ok).toBe(false);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get())
      .toMatchObject({ aktiv: true, typ: "lager" });
    expect(revalidiert).toEqual([]);
  });
});

describe("deaktiviereElement — dieselbe Revalidierungstabelle", () => {
  it.each(REVALIDIERUNG)("deaktiviert $art und revalidiert exakt dessen Pfade", async ({ art, pfade }) => {
    const id = elementAnlegen(art);

    expect(await deaktiviereElement(art, id, t.db)).toEqual({ ok: true });
    expect(elementAktiv(art, id)).toBe(false);
    expect(revalidiert).toEqual(pfade);
  });

  it("deaktiviert das migrierte Handlager nie", async () => {
    const ergebnis = await deaktiviereElement("fahrzeug", HANDLAGER_ID, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Das Handlager kann nicht deaktiviert werden.",
    });
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });
});

describe("Fehlpfade revalidieren nie", () => {
  it.each([
    {
      name: "Artikel-Blocker",
      art: "artikel" as const,
      anlegen: () => {
        const id = artikelAnlegen();
        templatePositionAnlegen(id);
        return id;
      },
    },
    {
      name: "Fahrzeug-Blocker",
      art: "fahrzeug" as const,
      anlegen: () => {
        const id = fahrzeugAnlegen();
        o2FlascheAnlegen(id);
        return id;
      },
    },
    {
      // Seit 8-F traegt dieser Fall die Buchung nur noch als Kulisse: die
      // Ablehnung stuende auch ohne sie. Der Fall bleibt, weil er die
      // Kombination „Blocker vorhanden + kein Schreiben + keine Revalidierung"
      // in derselben Form wie die beiden anderen Arten bezeugt; die eigentliche
      // Aussage zu 8-F steht weiter unten in ihrem eigenen Block.
      name: "Token-Historie",
      art: "token" as const,
      anlegen: () => {
        const id = tokenAnlegen({ code: "444-444" });
        buchungAnlegen({
          artikelId: artikelAnlegen(),
          quelleTyp: "token",
          quelleId: "444-444",
        });
        return id;
      },
    },
  ])("$name verhindert Mutation und Revalidierung", async ({ art, anlegen }) => {
    const id = anlegen();

    expect((await loescheElement(art, id, t.db)).ok).toBe(false);
    expect(elementVorhanden(art, id)).toBe(true);
    expect(revalidiert).toEqual([]);
  });
});

/**
 * ENTSCHEIDUNG 8-F (§8.3) — DER HARD-DELETE VON TOKENS FAELLT.
 *
 * Der Befund: bis T160 war ein Zugangs-Code loeschbar, solange NULL Buchungen
 * mit `quelleTyp="token"` auf seinen `code` zeigten. Zusammen mit einer
 * Kollisionspruefung gegen die VORHANDENEN Zeilen konnte ein gedrucktes, nie
 * eingeloestes Kaertchen seinen Code an ein spaeter ausgestelltes verlieren —
 * und weil `tokens.code` zugleich der Anzeigeschluessel im Journal ist
 * (1:1-Pflicht 6), erschienen historische Zeilen danach unter dem NEUEN Label.
 *
 * 8-F ist eine Ausnahme fuer TOKENS, keine neue Regel: der Hard-Delete der
 * uebrigen fuenf Objektarten bleibt (§5.21), und `last_used_at` wandert beim
 * Import weiterhin vollstaendig mit (§4.12, 1:1-Pflicht 5). Es ist danach kein
 * Loeschbarkeitsschalter mehr, sondern nur noch ein Anzeigewert.
 */
describe("8-F: Zugangs-Codes werden gesperrt, nicht geloescht", () => {
  it("verweigert das Loeschen auch bei nie benutztem Code", async () => {
    const id = tokenAnlegen({ code: "555-555" });

    const status = wert<Loeschbarkeit>(await pruefeLoeschbar("token", id, t.db));

    expect(status).toMatchObject({ loeschbar: false, kannDeaktivieren: true });
    if (!status.loeschbar) expect(status.grund).toBe(TOKEN_LOESCHGRUND);
    expect(revalidiert).toEqual([]);
  });

  it("verweigert es auch bei bereits benutztem Code", async () => {
    const id = tokenAnlegen({ code: "556-556", lastUsedAt: JETZT });

    erwarteBlockiert(await pruefeLoeschbar("token", id, t.db), "sperren");
  });

  /**
   * §11.7: Der Dialog zeigt `grund` woertlich an. Ein Grund ohne benannte
   * Alternative liesse die Person vor einer Sackgasse stehen. Der Text selbst
   * wird in `_lib/tokenForm.test.ts` geprueft; hier zaehlt, dass die Action
   * genau ihn liefert und keinen zweiten, danebenlaufenden Satz.
   */
  it("nennt das Sperren als Weg — im Text, nicht nur als Schalter", () => {
    expect(TOKEN_LOESCHGRUND).toContain("sperren");
  });

  /**
   * DIE ZEILE, DIE DEN NAMENSRAUM SCHUETZT: `loescheElement` darf die Zeile
   * unter KEINEN Umstaenden entfernen — auch nicht, wenn jemand spaeter
   * `pruefe()` „grosszuegiger" macht.
   *
   * ⚠️ `loescheElement` WIRFT NIE. Sie faengt alles und liefert
   * `{ ok: false, fehler }` zurueck; ein `rejects.toThrow()` waere hier
   * falsch-gruen aus dem falschen Grund. Der Global Constraint lautet: Fehler
   * kommen als Rueckgabewert an, nie ueber `e.message` — in Produktion ist
   * `e.message` der englische Satz ueber eine „server-side exception".
   */
  it("entfernt die Zeile auch dann nicht, wenn loescheElement direkt gerufen wird", async () => {
    const id = tokenAnlegen({ code: "557-557" });

    const ergebnis = await loescheElement("token", id, t.db);

    expect(ergebnis.ok).toBe(false);
    expect(fehlerVon(ergebnis).fehler).toBe(TOKEN_LOESCHGRUND);
    expect(fehlerVon(ergebnis).fehler, "der Weg muss im Fehlertext stehen")
      .toContain("sperren");
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()).toBeDefined();
    expect(revalidiert).toEqual([]);
  });

  /**
   * Der Zweig fehlt nicht nur zur Laufzeit, sondern im Quelltext. Ein
   * wiederhergestelltes `case "token"` in `loescheElement` waere die Ruecknahme
   * von 8-F, und `pruefe()` ist die einzige Schranke davor.
   */
  it("traegt in loeschen.ts keine Zeile mehr, die eine Token-Zeile entfernt", () => {
    const quelle = readFileSync(QUELLE, "utf8");

    expect(quelle, "8-F: keine Loeschzeile auf der Token-Tabelle")
      .not.toContain("delete(tokens)");
    expect(quelle, "der Sperrweg bleibt")
      .toContain("update(tokens)");
  });

  /** Der zweite Ausgang bleibt und wirkt: `aktiv = false`. */
  it("sperrt ueber deaktiviereElement", async () => {
    const id = tokenAnlegen({ code: "558-558" });

    expect(await deaktiviereElement("token", id, t.db)).toEqual({ ok: true });
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()?.aktiv)
      .toBe(false);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/tokens"]);
  });

  /**
   * §5.21: 8-F ist eine Ausnahme fuer Tokens. Die Gegenrichtung wird
   * mitgeprueft, damit niemand die Regel verallgemeinert.
   */
  it("laesst den Hard-Delete der uebrigen Arten unberuehrt", async () => {
    const id = artikelAnlegen("art-frisch");

    expect(await pruefeLoeschbar("artikel", id, t.db)).toEqual({
      ok: true,
      wert: { loeschbar: true },
    });
    expect(await loescheElement("artikel", id, t.db)).toEqual({ ok: true });
    expect(t.db.select().from(artikel).where(eq(artikel.id, id)).get()).toBeUndefined();
  });
});

describe("Fixture-Selbstpruefung", () => {
  it("Verfall-Fixtures tragen eine echte ID und echte Fremdschluessel", () => {
    const artikelId = artikelAnlegen();
    const fahrzeugId = fahrzeugAnlegen();
    verfallAnlegen(artikelId, fahrzeugId, "verfall-echt");

    expect(t.db.select().from(lagerortVerfall).where(and(
      eq(lagerortVerfall.lagerortId, fahrzeugId),
      eq(lagerortVerfall.artikelId, artikelId),
    )).get()).toMatchObject({ id: "verfall-echt" });
  });
});
