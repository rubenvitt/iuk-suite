import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, inventuren, inventurPositionen, lagerorte } from "../_db/schema";
import { INVENTUR_TEXTE } from "../_lib/inventurTexte";
import {
  CHARGE_INVENTUR,
  CHARGE_KORREKTUR,
  HANDLAGER_ID,
  PSEUDO_VERFALL,
} from "../_lib/konstanten";

/**
 * T116 — die Inventur ist ein eigener Schreibpfad.
 *
 * Die Tests tragen die Abweichungen zum alten Plan ausdruecklich:
 *
 * - `ist` wird gegen den LIVE-Bestand im Handlager gerechnet. Ein Seiten-Snapshot
 *   darf eine zwischenzeitliche Entnahme nicht rueckgaengig machen.
 * - Fahrzeugbestand derselben Charge zaehlt nicht zum Handlager.
 * - Abwaerts wird real per FEFO und `typ: "korrektur"` gebucht.
 * - Aufwaerts gilt `verfall` ↓, `createdAt` ↓, `id` ↓. Ohne Charge entsteht
 *   `Inventur` / `2099-12`, ausdruecklich NICHT die allgemeine `Korrektur`-Charge.
 * - Ein Lauf ist eine Transaktion mit einer gemeinsamen `inventur:<id>`-Referenz.
 */

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

/**
 * Jede Action in dieser Datei bekommt `t.db` ausdruecklich. Ein Wurf macht
 * einen vergessenen Parameter laut, bevor ein Test die echte `.data`-Datei
 * beruehren koennte.
 */
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { inventurKorrektur } from "./inventur";

const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};
const JETZT = new Date("2026-07-15T10:00:00Z");
const ERFOLGS_PFADE = [
  "/m/lagerbuch/verwaltung/inventur",
  "/m/lagerbuch/verwaltung/inventur/verlauf",
  "/m/lagerbuch/verwaltung/artikel",
  "/m/lagerbuch/verwaltung",
];

let t: TestDb;
let buchungNr = 0;

beforeEach(() => {
  revalidiert.length = 0;
  buchungNr = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-inventur-");

  // `handlager` wird von der echten Migration angelegt. Nur das Fahrzeug ist
  // Testfixture; alle Felder spiegeln die reale lagerorte-Zeile.
  t.db.insert(lagerorte).values({
    id: "rtw-1",
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "1/83-1",
    aktiv: true,
    templateId: null,
  }).run();
  expect(t.db.select().from(lagerorte).all().some((l) => l.id === HANDLAGER_ID)).toBe(true);
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function legeArtikelAn(id: string, name = id): void {
  t.db.insert(artikel).values({
    id,
    name,
    einheit: "Stk.",
    fach: `Fach ${id}`,
    mindestbestand: 0,
    aktiv: true,
    bestelltAt: null,
    createdAt: JETZT,
  }).run();
}

function legeChargeAn(args: {
  id: string;
  artikelId: string;
  verfall: string;
  createdAt?: Date;
  chargenNr?: string;
}): void {
  t.db.insert(chargen).values({
    id: args.id,
    artikelId: args.artikelId,
    chargenNr: args.chargenNr ?? args.id,
    verfall: args.verfall,
    createdAt: args.createdAt ?? JETZT,
  }).run();
}

function buche(args: {
  artikelId: string;
  chargeId: string;
  lagerortId?: string;
  menge: number;
  typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
  quelleTyp?: "token" | "oidc" | "system";
  quelleId?: string;
}): void {
  t.db.insert(buchungen).values({
    id: `fixture-buchung-${++buchungNr}`,
    ts: JETZT,
    typ: args.typ ?? "zugang",
    artikelId: args.artikelId,
    chargeId: args.chargeId,
    lagerortId: args.lagerortId ?? HANDLAGER_ID,
    menge: args.menge,
    quelleTyp: args.quelleTyp ?? "system",
    quelleId: args.quelleId ?? "fixture",
    referenz: null,
    kommentar: null,
  }).run();
}

function handlagerBestand(artikelId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.artikelId === artikelId && b.lagerortId === HANDLAGER_ID)
    .reduce((summe, b) => summe + b.menge, 0);
}

function inventurBuchungen() {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.referenz?.startsWith("inventur:"));
}

describe("inventurKorrektur — Riegel, Validierung und Fehlergrenze", () => {
  it("fragt den Admin-Riegel vor der Validierung", async () => {
    adminRiegel.mockRejectedValueOnce(new Error("ADMIN-RIEGEL"));

    await expect(inventurKorrektur({ kommentar: " ", positionen: [] }, t.db))
      .rejects.toThrow("ADMIN-RIEGEL");

    expect(t.db.select().from(buchungen).all()).toHaveLength(0);
    expect(revalidiert).toEqual([]);
  });

  it("weist leeren Kommentar und leere Positionsliste ohne Schreiben oder Revalidierung ab", async () => {
    const ohneKommentar = await inventurKorrektur({
      kommentar: "   ",
      positionen: [{ artikelId: "art-1", ist: 0 }],
    }, t.db);
    const ohnePosition = await inventurKorrektur({ kommentar: "Inventur", positionen: [] }, t.db);

    expect(ohneKommentar).toMatchObject({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { kommentar: "Kommentar erforderlich" },
    });
    expect(ohnePosition).toMatchObject({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { positionen: "Keine Zählung erfasst" },
    });
    expect(t.db.select().from(buchungen).all()).toHaveLength(0);
    expect(revalidiert).toEqual([]);
  });

  it("rollt alle Positionen bei einem spaeten Datenbankfehler zurueck und verbirgt Infrastrukturtext", async () => {
    legeArtikelAn("art-erste", "Erste Position");
    const chargenVorher = t.db.select().from(chargen).all().length;
    const buchungenVorher = t.db.select().from(buchungen).all().length;

    const erg = await inventurKorrektur({
      kommentar: "Rollback",
      positionen: [
        // Die erste Position legt Pseudo-Charge plus Buchung an. Die zweite
        // scheitert am echten Artikel-FK — beides muss gemeinsam verschwinden.
        { artikelId: "art-erste", ist: 2 },
        { artikelId: "art-existiert-nicht", ist: 1 },
      ],
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Inventur konnte nicht gebucht werden." });
    expect((erg as { ok: false; fehler: string }).fehler).not.toMatch(/foreign key|sqlite/i);
    expect(t.db.select().from(chargen).all()).toHaveLength(chargenVorher);
    expect(t.db.select().from(buchungen).all()).toHaveLength(buchungenVorher);
    expect(revalidiert).toEqual([]);
  });
});

describe("inventurKorrektur — LIVE-Handlagerbestand", () => {
  it("schreibt nach einer parallelen Entnahme keine kompensierende Korrektur", async () => {
    legeArtikelAn("art-live", "Live-Bestand");
    legeChargeAn({ id: "charge-live", artikelId: "art-live", verfall: "2027-01" });
    buche({ artikelId: "art-live", chargeId: "charge-live", menge: 10 });

    // Zwischen Seitenladen (10) und Absenden werden 4 entnommen. Die gezahlten
    // 6 entsprechen dem LIVE-Bestand, also darf keine weitere Zeile entstehen.
    buche({
      artikelId: "art-live",
      chargeId: "charge-live",
      menge: -4,
      typ: "entnahme",
      quelleTyp: "token",
      quelleId: "111-111",
    });
    const zeilenVorher = t.db.select().from(buchungen).all().length;

    const erg = await inventurKorrektur({
      kommentar: "Live-Abgleich",
      positionen: [{ artikelId: "art-live", ist: 6 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0, inventurId: expect.any(String) } });
    expect(handlagerBestand("art-live")).toBe(6);
    expect(t.db.select().from(buchungen).all()).toHaveLength(zeilenVorher);
    expect(inventurBuchungen()).toEqual([]);
    expect(revalidiert).toEqual(ERFOLGS_PFADE);
  });

  it("zaehlt Fahrzeugbestand derselben Charge nicht zum Handlager", async () => {
    legeArtikelAn("art-ort", "Lagerortbindung");
    legeChargeAn({ id: "charge-ort", artikelId: "art-ort", verfall: "2027-02" });
    buche({ artikelId: "art-ort", chargeId: "charge-ort", menge: 4 });
    buche({ artikelId: "art-ort", chargeId: "charge-ort", lagerortId: "rtw-1", menge: 6 });

    const erg = await inventurKorrektur({
      kommentar: "Nur Handlager",
      positionen: [{ artikelId: "art-ort", ist: 4 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0, inventurId: expect.any(String) } });
    expect(handlagerBestand("art-ort")).toBe(4);
    expect(inventurBuchungen()).toEqual([]);
  });
});

describe("inventurKorrektur — diff < 0", () => {
  it("bucht die Abweichung per FEFO negativ mit typ korrektur", async () => {
    legeArtikelAn("art-fefo", "FEFO-Abgang");
    legeChargeAn({ id: "charge-frueh", artikelId: "art-fefo", verfall: "2026-09" });
    legeChargeAn({ id: "charge-spaet", artikelId: "art-fefo", verfall: "2028-01" });
    buche({ artikelId: "art-fefo", chargeId: "charge-frueh", menge: 3 });
    buche({ artikelId: "art-fefo", chargeId: "charge-spaet", menge: 7 });

    const erg = await inventurKorrektur({
      kommentar: "  Quartalsinventur  ",
      positionen: [{ artikelId: "art-fefo", ist: 5 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1, inventurId: expect.any(String) } });
    expect(handlagerBestand("art-fefo")).toBe(5);
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(2);
    expect(korrekturen.map((b) => ({ chargeId: b.chargeId, menge: b.menge })))
      .toEqual([
        { chargeId: "charge-frueh", menge: -3 },
        { chargeId: "charge-spaet", menge: -2 },
      ]);
    for (const b of korrekturen) {
      expect(b).toMatchObject({
        typ: "korrektur",
        artikelId: "art-fefo",
        lagerortId: HANDLAGER_ID,
        quelleTyp: "oidc",
        quelleId: "u-admin",
        kommentar: "Quartalsinventur",
      });
    }
  });
});

describe("inventurKorrektur — diff > 0 waehlt die juengste Charge", () => {
  it("ordnet zuerst nach verfall absteigend", async () => {
    legeArtikelAn("art-verfall", "Verfallssortierung");
    // Die fachlich juengste Charge verliert absichtlich bei createdAt UND id.
    legeChargeAn({
      id: "charge-a-lang",
      artikelId: "art-verfall",
      verfall: "2029-01",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    legeChargeAn({
      id: "charge-z-kurz",
      artikelId: "art-verfall",
      verfall: "2027-01",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    buche({ artikelId: "art-verfall", chargeId: "charge-z-kurz", menge: 2 });

    await inventurKorrektur({
      kommentar: "Mehrbestand",
      positionen: [{ artikelId: "art-verfall", ist: 5 }],
    }, t.db);

    expect(inventurBuchungen()).toHaveLength(1);
    expect(inventurBuchungen()[0]).toMatchObject({
      chargeId: "charge-a-lang",
      menge: 3,
      typ: "korrektur",
    });
  });

  it("ordnet bei gleichem verfall nach createdAt absteigend", async () => {
    legeArtikelAn("art-created", "Zeitsortierung");
    // Die juengere Charge verliert absichtlich beim id-Tiebreak.
    legeChargeAn({
      id: "charge-z-alt",
      artikelId: "art-created",
      verfall: "2028-06",
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    legeChargeAn({
      id: "charge-a-neu",
      artikelId: "art-created",
      verfall: "2028-06",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    buche({ artikelId: "art-created", chargeId: "charge-z-alt", menge: 1 });

    await inventurKorrektur({
      kommentar: "Mehrbestand",
      positionen: [{ artikelId: "art-created", ist: 4 }],
    }, t.db);

    expect(inventurBuchungen()[0]).toMatchObject({ chargeId: "charge-a-neu", menge: 3 });
  });

  it("entscheidet bei gleichem verfall und createdAt deterministisch per id absteigend", async () => {
    legeArtikelAn("art-id", "ID-Tiebreak");
    const gleich = new Date("2026-02-01T00:00:00Z");
    // Verliererin zuerst: ohne dritten Sortierschluessel bliebe sie wegen des
    // stabilen Array-Sorts vorne.
    legeChargeAn({ id: "charge-tie-1", artikelId: "art-id", verfall: "2028-08", createdAt: gleich });
    legeChargeAn({ id: "charge-tie-2", artikelId: "art-id", verfall: "2028-08", createdAt: gleich });
    buche({ artikelId: "art-id", chargeId: "charge-tie-1", menge: 1 });

    await inventurKorrektur({
      kommentar: "Mehrbestand",
      positionen: [{ artikelId: "art-id", ist: 2 }],
    }, t.db);

    expect(inventurBuchungen()[0]).toMatchObject({ chargeId: "charge-tie-2", menge: 1 });
  });

  it("legt ohne vorhandene Charge exakt Inventur statt Korrektur an", async () => {
    legeArtikelAn("art-ohne-charge", "Ohne Charge");

    const erg = await inventurKorrektur({
      kommentar: "Erstbestand",
      positionen: [{ artikelId: "art-ohne-charge", ist: 4 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1, inventurId: expect.any(String) } });
    const neueChargen = t.db.select().from(chargen).all()
      .filter((c) => c.artikelId === "art-ohne-charge");
    expect(neueChargen).toHaveLength(1);
    expect(neueChargen[0]).toMatchObject({
      chargenNr: CHARGE_INVENTUR,
      verfall: PSEUDO_VERFALL,
    });
    expect(neueChargen[0]!.chargenNr).not.toBe(CHARGE_KORREKTUR);
    expect(inventurBuchungen()[0]).toMatchObject({
      artikelId: "art-ohne-charge",
      chargeId: neueChargen[0]!.id,
      lagerortId: HANDLAGER_ID,
      menge: 4,
      typ: "korrektur",
    });
  });
});

describe("inventurKorrektur — ein Lauf", () => {
  it("teilt eine Referenz und zaehlt nur Positionen mit Abweichung", async () => {
    for (const id of ["art-minus", "art-gleich", "art-plus"]) {
      legeArtikelAn(id);
      legeChargeAn({ id: `charge-${id}`, artikelId: id, verfall: "2028-01" });
    }
    buche({ artikelId: "art-minus", chargeId: "charge-art-minus", menge: 5 });
    buche({ artikelId: "art-gleich", chargeId: "charge-art-gleich", menge: 5 });
    buche({ artikelId: "art-plus", chargeId: "charge-art-plus", menge: 1 });

    const erg = await inventurKorrektur({
      kommentar: "  Gemeinsamer Lauf  ",
      positionen: [
        { artikelId: "art-minus", ist: 3 },
        { artikelId: "art-gleich", ist: 5 },
        { artikelId: "art-plus", ist: 4 },
      ],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 2, inventurId: expect.any(String) } });
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(2);
    expect(new Set(korrekturen.map((b) => b.referenz)).size).toBe(1);
    expect(korrekturen[0]!.referenz).toMatch(/^inventur:[A-Za-z0-9_-]+$/);
    expect(korrekturen.map((b) => b.artikelId).sort()).toEqual(["art-minus", "art-plus"]);
    expect(korrekturen.every((b) => b.kommentar === "Gemeinsamer Lauf")).toBe(true);
    expect(revalidiert).toEqual(ERFOLGS_PFADE);
  });
});

function laeufe() { return t.db.select().from(inventuren).all(); }
function positionen() { return t.db.select().from(inventurPositionen).all(); }
function chargenBestand(chargeId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.chargeId === chargeId && b.lagerortId === HANDLAGER_ID)
    .reduce((s, b) => s + b.menge, 0);
}

describe("inventurKorrektur — der Lauf wird gespeichert", () => {
  it("speichert Kopf und JEDE angefasste Artikelposition, auch ohne Abweichung", async () => {
    legeArtikelAn("art-gleich"); legeChargeAn({ id: "c-gleich", artikelId: "art-gleich", verfall: "2028-01" });
    legeArtikelAn("art-minus"); legeChargeAn({ id: "c-minus", artikelId: "art-minus", verfall: "2028-01" });
    buche({ artikelId: "art-gleich", chargeId: "c-gleich", menge: 5 });
    buche({ artikelId: "art-minus", chargeId: "c-minus", menge: 5 });

    const erg = await inventurKorrektur({
      kommentar: " Quartal ",
      umfang: { kategorien: ["Hygiene"], faecher: ["A1"] },
      positionen: [{ artikelId: "art-gleich", ist: 5 }, { artikelId: "art-minus", ist: 3 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1, inventurId: expect.any(String) } });
    const inventurId = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    expect(laeufe()).toEqual([expect.objectContaining({
      id: inventurId, quelleTyp: "oidc", quelleId: "u-admin", kommentar: "Quartal",
      umfang: JSON.stringify({ kategorien: ["Hygiene"], faecher: ["A1"] }),
    })]);
    expect(positionen().map((p) => [p.artikelId, p.chargeId, p.erwartet, p.gezaehlt]).sort())
      .toEqual([["art-gleich", null, 5, 5], ["art-minus", null, 5, 3]]);
    expect(inventurBuchungen().every((b) => b.referenz === `inventur:${inventurId}`)).toBe(true);
  });

  it("speichert umfang null, wenn kein Filter mitkommt", async () => {
    legeArtikelAn("art-a");
    await inventurKorrektur({ kommentar: "Voll", positionen: [{ artikelId: "art-a", ist: 0 }] }, t.db);
    expect(laeufe()[0]!.umfang).toBeNull();
  });
});

describe("inventurKorrektur — Zaehlung je Charge", () => {
  beforeEach(() => {
    legeArtikelAn("art-c");
    legeChargeAn({ id: "c-frueh", artikelId: "art-c", verfall: "2026-10" });
    legeChargeAn({ id: "c-spaet", artikelId: "art-c", verfall: "2029-01" });
    buche({ artikelId: "art-c", chargeId: "c-frueh", menge: 4 });
    buche({ artikelId: "art-c", chargeId: "c-spaet", menge: 6 });
  });

  it("laesst eine NICHT angefasste Charge unveraendert — nie implizit 0", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Charge",
      positionen: [{ artikelId: "art-c", chargen: [{ chargeId: "c-spaet", ist: 6 }], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 0 } });
    expect(chargenBestand("c-frueh")).toBe(4);
    expect(inventurBuchungen()).toEqual([]);
    expect(positionen().map((p) => [p.chargeId, p.erwartet, p.gezaehlt])).toEqual([["c-spaet", 6, 6]]);
  });

  it("bucht Minus und Plus auf GENAU die gezaehlte Charge, nicht per FEFO", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Charge",
      positionen: [{ artikelId: "art-c", chargen: [
        { chargeId: "c-spaet", ist: 1 },
        { chargeId: "c-frueh", ist: 7 },
      ], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 2 } });
    expect(chargenBestand("c-spaet")).toBe(1);
    expect(chargenBestand("c-frueh")).toBe(7);
    expect(inventurBuchungen().map((b) => [b.chargeId, b.menge, b.typ]).sort())
      .toEqual([["c-frueh", 3, "korrektur"], ["c-spaet", -5, "korrektur"]]);
  });

  it("rechnet erwartet gegen den LIVE-Rest der Charge", async () => {
    buche({ artikelId: "art-c", chargeId: "c-frueh", menge: -3, typ: "entnahme" });
    await inventurKorrektur({
      kommentar: "Live",
      positionen: [{ artikelId: "art-c", chargen: [{ chargeId: "c-frueh", ist: 1 }], neu: [] }],
    }, t.db);
    expect(positionen()[0]).toMatchObject({ chargeId: "c-frueh", erwartet: 1, gezaehlt: 1 });
    expect(inventurBuchungen()).toEqual([]);
  });

  it.each([
    ["eine fremde Charge", "c-fremd"],
    ["eine unbekannte Charge", "gibt-es-nicht"],
  ])("weist %s ab und schreibt NICHTS, auch keinen Lauf", async (_fall, chargeId) => {
    legeArtikelAn("art-fremd");
    legeChargeAn({ id: "c-fremd", artikelId: "art-fremd", verfall: "2028-01" });
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await inventurKorrektur({
      kommentar: "Fremd",
      positionen: [
        { artikelId: "art-c", chargen: [{ chargeId: "c-spaet", ist: 0 }], neu: [] },
        { artikelId: "art-c-zwei", chargen: [{ chargeId, ist: 1 }], neu: [] },
      ],
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: INVENTUR_TEXTE.chargeUnpassend });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    expect(laeufe()).toEqual([]);
    expect(positionen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("legt eine ergaenzte Charge mit ECHTEM MHD an; leere Nummer wird Inventur", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Fund",
      positionen: [{ artikelId: "art-c", chargen: [], neu: [{ verfall: "2027-03", chargenNr: "  ", ist: 2 }] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const neu = t.db.select().from(chargen).all().filter((c) => c.verfall === "2027-03");
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ artikelId: "art-c", chargenNr: CHARGE_INVENTUR });
    expect(neu[0]!.verfall).not.toBe(PSEUDO_VERFALL);
    expect(chargenBestand(neu[0]!.id)).toBe(2);
    expect(positionen()[0]).toMatchObject({ chargeId: neu[0]!.id, erwartet: 0, gezaehlt: 2 });
  });

  it("verwendet bei gleichem Schluessel die juengste vorhandene Charge wieder", async () => {
    legeChargeAn({ id: "c-alt-leer", artikelId: "art-c", verfall: "2027-05", chargenNr: "L-1", createdAt: new Date("2025-01-01T00:00:00Z") });
    legeChargeAn({ id: "c-neu-leer", artikelId: "art-c", verfall: "2027-05", chargenNr: "L-1", createdAt: new Date("2026-01-01T00:00:00Z") });
    const vorher = t.db.select().from(chargen).all().length;

    await inventurKorrektur({
      kommentar: "Fund",
      positionen: [{ artikelId: "art-c", chargen: [], neu: [{ verfall: "2027-05", chargenNr: "L-1", ist: 3 }] }],
    }, t.db);

    expect(t.db.select().from(chargen).all()).toHaveLength(vorher);
    expect(chargenBestand("c-neu-leer")).toBe(3);
    expect(chargenBestand("c-alt-leer")).toBe(0);
  });

  it("weist eine Ergaenzung ab, die eine gleichzeitig gezaehlte Charge trifft", async () => {
    legeChargeAn({ id: "c-nr", artikelId: "art-c", verfall: "2027-07", chargenNr: "X-9" });
    const erg = await inventurKorrektur({
      kommentar: "Doppelt",
      positionen: [{ artikelId: "art-c",
        chargen: [{ chargeId: "c-nr", ist: 1 }],
        neu: [{ verfall: "2027-07", chargenNr: "X-9", ist: 1 }] }],
    }, t.db);
    expect(erg).toEqual({ ok: false, fehler: INVENTUR_TEXTE.chargeDoppelt });
    expect(laeufe()).toEqual([]);
  });
});

describe("inventurKorrektur — Schema der Chargenposition", () => {
  it.each([
    ["ohne Charge und ohne Ergaenzung", { artikelId: "a", chargen: [], neu: [] }],
    ["mit ist UND chargen", { artikelId: "a", ist: 1, chargen: [{ chargeId: "c", ist: 1 }], neu: [] }],
    ["mit doppelter chargeId", { artikelId: "a", chargen: [{ chargeId: "c", ist: 1 }, { chargeId: "c", ist: 2 }], neu: [] }],
    ["mit Ergaenzung ist 0", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-01", ist: 0 }] }],
    ["mit ungueltigem Monat", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-13", ist: 1 }] }],
    ["mit zwei gleichen Ergaenzungen", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-01", ist: 1 }, { verfall: "2027-01", chargenNr: "", ist: 2 }] }],
  ])("weist eine Position %s ab", async (_fall, position) => {
    const erg = await inventurKorrektur({ kommentar: "Schema", positionen: [position] }, t.db);
    expect(erg).toMatchObject({ ok: false, fehler: "Bitte die markierten Felder prüfen." });
    expect(laeufe()).toEqual([]);
  });

  it("weist denselben Artikel in zwei Positionen ab", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Schema",
      positionen: [{ artikelId: "a", ist: 1 }, { artikelId: "a", chargen: [{ chargeId: "c", ist: 1 }], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: false, fehler: "Bitte die markierten Felder prüfen." });
  });
});

/**
 * DRK-297, NACHTRAG ZU AUFGABE 6 — `bucheKorrektur` schreibt nicht mehr blind
 * auf die Wurzel: liegt eine Charge (teilweise oder ganz) in einem Schrank,
 * geht die Korrektur DORTHIN. Vorher drueckte ein negativer Diff auf eine
 * Charge, die vollstaendig im Schrank lag, den (Wurzel, Charge)-Saldo ins
 * Minus — in ein Journal ohne UPDATE und ohne DELETE.
 */
describe("inventurKorrektur — DRK-297 (Nachtrag): die Korrektur landet dort, wo die Charge liegt", () => {
  beforeEach(() => {
    t.db.insert(lagerorte).values(
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 }).run();
  });

  function bestandAn(chargeId: string, lagerortId: string): number {
    return t.db.select().from(buchungen).all()
      .filter((b) => b.chargeId === chargeId && b.lagerortId === lagerortId)
      .reduce((s, b) => s + b.menge, 0);
  }

  it("zaehlt WENIGER als eine Charge, die ausschliesslich im Schrank liegt — die Korrektur traegt den Schrank", async () => {
    legeArtikelAn("art-schrank-minus");
    legeChargeAn({ id: "c-schrank-minus", artikelId: "art-schrank-minus", verfall: "2027-06" });
    buche({ artikelId: "art-schrank-minus", chargeId: "c-schrank-minus", lagerortId: "schrank-1", menge: 12 });

    const erg = await inventurKorrektur({
      kommentar: "Schrank",
      positionen: [{ artikelId: "art-schrank-minus", chargen: [{ chargeId: "c-schrank-minus", ist: 9 }], neu: [] }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({
      chargeId: "c-schrank-minus", lagerortId: "schrank-1", menge: -3, typ: "korrektur",
    });
    // Der Bereichsbestand stimmt mit der gezaehlten Zahl ueberein, und KEIN
    // Ort faellt unter 0 — insbesondere nicht die Wurzel, die von dieser
    // Charge nie etwas hatte.
    expect(bestandAn("c-schrank-minus", "schrank-1")).toBe(9);
    expect(bestandAn("c-schrank-minus", HANDLAGER_ID)).toBe(0);
  });

  it("zaehlt MEHR als eine Charge, die ausschliesslich im Schrank liegt — die Gutschrift landet am Schrank", async () => {
    legeArtikelAn("art-schrank-plus");
    legeChargeAn({ id: "c-schrank-plus", artikelId: "art-schrank-plus", verfall: "2027-06" });
    buche({ artikelId: "art-schrank-plus", chargeId: "c-schrank-plus", lagerortId: "schrank-1", menge: 12 });

    const erg = await inventurKorrektur({
      kommentar: "Schrank",
      positionen: [{ artikelId: "art-schrank-plus", chargen: [{ chargeId: "c-schrank-plus", ist: 15 }], neu: [] }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({
      chargeId: "c-schrank-plus", lagerortId: "schrank-1", menge: 3, typ: "korrektur",
    });
    expect(bestandAn("c-schrank-plus", "schrank-1")).toBe(15);
    expect(bestandAn("c-schrank-plus", HANDLAGER_ID)).toBe(0);
  });

  it("eine Charge OHNE jeden Bestand zaehlt mehr — die Gutschrift landet auf der Wurzel", async () => {
    legeArtikelAn("art-ohne-bestand");
    // Eine angelegte, aber noch nie gebuchte Charge — Rest ueberall 0.
    legeChargeAn({ id: "c-ohne-bestand", artikelId: "art-ohne-bestand", verfall: "2027-06" });

    const erg = await inventurKorrektur({
      kommentar: "Fund",
      positionen: [{ artikelId: "art-ohne-bestand", chargen: [{ chargeId: "c-ohne-bestand", ist: 5 }], neu: [] }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({
      chargeId: "c-ohne-bestand", lagerortId: HANDLAGER_ID, menge: 5, typ: "korrektur",
    });
  });
});

/**
 * DRK-337 — DIE ZAEHLUNG JE SCHRANK.
 *
 * Bis hierher zaehlt jeder Lauf den GANZEN Handlager; die Korrektur landet
 * seit DRK-297 am richtigen Ort, die ERWARTUNGSZAHL ist aber eine Summe ueber
 * alle Orte. Wer mit der Liste vor einem einzelnen Schrank steht, liest damit
 * eine Zahl, die er dort nie zaehlen kann.
 *
 * ⚠️ DREI DINGE HAENGEN AM ORT, UND ALLE DREI STEHEN HIER: wogegen gerechnet
 * wird, wohin ein Fehlbestand abgebucht wird und — der stillste Fall — wohin
 * ein UEBERHANG geht, den es an diesem Ort noch gar nicht gibt.
 */
describe("inventurKorrektur — DRK-337: ein Lauf zaehlt genau einen Ort", () => {
  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 },
      { id: "schrank-2", name: "Schrank 2", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 20 },
    ]).run();
  });

  function bestandAn(artikelId: string, lagerortId: string): number {
    return t.db.select().from(buchungen).all()
      .filter((b) => b.artikelId === artikelId && b.lagerortId === lagerortId)
      .reduce((s, b) => s + b.menge, 0);
  }

  function umfangVon(inventurId: string): string | null {
    return t.db.select().from(inventuren).all().find((i) => i.id === inventurId)?.umfang ?? null;
  }

  /** Verteilt EINEN Artikel ueber Wurzel, Schrank 1 und Schrank 2. */
  function verteilterArtikel(id: string): void {
    legeArtikelAn(id);
    legeChargeAn({ id: `c-${id}`, artikelId: id, verfall: "2027-05" });
    buche({ artikelId: id, chargeId: `c-${id}`, lagerortId: HANDLAGER_ID, menge: 4 });
    buche({ artikelId: id, chargeId: `c-${id}`, lagerortId: "schrank-1", menge: 6 });
    buche({ artikelId: id, chargeId: `c-${id}`, lagerortId: "schrank-2", menge: 2 });
  }

  it("rechnet gegen den Bestand IM SCHRANK, nicht gegen die Summe ueber alle Orte", async () => {
    verteilterArtikel("art-ort");

    // 6 liegen in Schrank 1, 12 im ganzen Handlager. Wer 6 zaehlt, hat recht —
    // vor DRK-337 waere daraus eine Abbuchung von 6 geworden.
    const erg = await inventurKorrektur({
      kommentar: "Schrank 1", ortId: "schrank-1",
      positionen: [{ artikelId: "art-ort", ist: 6 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0, inventurId: expect.any(String) } });
    expect(inventurBuchungen()).toEqual([]);
    const id = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    // Die gespeicherte Position traegt die ORTSZAHL — sie ist der Beleg im Verlauf.
    expect(t.db.select().from(inventurPositionen).all()
      .filter((p) => p.inventurId === id)
      .map((p) => [p.erwartet, p.gezaehlt]))
      .toEqual([[6, 6]]);
  });

  it("bucht einen Fehlbestand im gezaehlten Schrank ab und laesst Wurzel und Nachbarschrank unberuehrt", async () => {
    verteilterArtikel("art-minus");

    const erg = await inventurKorrektur({
      kommentar: "Schrank 1", ortId: "schrank-1",
      positionen: [{ artikelId: "art-minus", ist: 4 }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    expect(inventurBuchungen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })))
      .toEqual([{ lagerortId: "schrank-1", menge: -2 }]);
    expect(bestandAn("art-minus", "schrank-1")).toBe(4);
    expect(bestandAn("art-minus", HANDLAGER_ID)).toBe(4);
    expect(bestandAn("art-minus", "schrank-2")).toBe(2);
  });

  /**
   * ⚠️ DER STILLSTE FALL, UND DER GRUND FUER `lauf.rueckfallOrt`. Die Charge
   * hat im gezaehlten Schrank KEINEN Bestand — es gibt also keinen Kandidaten,
   * an dem sie schon liegt, und vor DRK-337 fiel die Gutschrift damit auf die
   * WURZEL. Das Material lag danach buchhalterisch an einem Ort, vor dem
   * niemand gestanden hatte (Akzeptanzkriterium 3).
   */
  it("bucht einen Ueberhang auf den gezaehlten Schrank, nicht auf die Wurzel", async () => {
    legeArtikelAn("art-fund");
    legeChargeAn({ id: "c-fund", artikelId: "art-fund", verfall: "2027-05" });
    buche({ artikelId: "art-fund", chargeId: "c-fund", lagerortId: HANDLAGER_ID, menge: 9 });

    const erg = await inventurKorrektur({
      kommentar: "Fund in Schrank 2", ortId: "schrank-2",
      positionen: [{ artikelId: "art-fund", ist: 3 }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    expect(inventurBuchungen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })))
      .toEqual([{ lagerortId: "schrank-2", menge: 3 }]);
    expect(bestandAn("art-fund", HANDLAGER_ID)).toBe(9);
    expect(bestandAn("art-fund", "schrank-2")).toBe(3);
  });

  it("bucht denselben Ueberhang ohne Ortswahl weiterhin auf die Wurzel", async () => {
    legeArtikelAn("art-fund-alt");
    legeChargeAn({ id: "c-fund-alt", artikelId: "art-fund-alt", verfall: "2027-05" });

    const erg = await inventurKorrektur({
      kommentar: "Ohne Ort",
      positionen: [{ artikelId: "art-fund-alt", ist: 3 }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    expect(inventurBuchungen().map((b) => b.lagerortId)).toEqual([HANDLAGER_ID]);
  });

  /**
   * Die Wurzel IST ein waehlbarer Ort: „im Handlager, Schrank noch nicht
   * zugeordnet" (Migration 0008). Sie meint dabei NUR sich selbst — waere sie
   * der ganze Teilbaum, erwartete diese Zaehlung still 12 statt 4.
   */
  it("zaehlt mit der Wurzel nur den nicht zugeordneten Bestand", async () => {
    verteilterArtikel("art-wurzel");

    const erg = await inventurKorrektur({
      kommentar: "Nicht zugeordnet", ortId: HANDLAGER_ID,
      positionen: [{ artikelId: "art-wurzel", ist: 4 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0, inventurId: expect.any(String) } });
    expect(inventurBuchungen()).toEqual([]);
  });

  it("rechnet auch den Chargenweg gegen den Ort und bucht auf ihn", async () => {
    verteilterArtikel("art-charge-ort");

    const erg = await inventurKorrektur({
      kommentar: "Chargen in Schrank 1", ortId: "schrank-1",
      positionen: [{
        artikelId: "art-charge-ort",
        chargen: [{ chargeId: "c-art-charge-ort", ist: 5 }],
        neu: [],
      }],
    }, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const id = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    expect(t.db.select().from(inventurPositionen).all()
      .filter((p) => p.inventurId === id)
      .map((p) => [p.erwartet, p.gezaehlt]))
      .toEqual([[6, 5]]);
    expect(inventurBuchungen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })))
      .toEqual([{ lagerortId: "schrank-1", menge: -1 }]);
  });

  /**
   * ⚠️ DIE ACTION IST STRENGER ALS DIE SEITE. Die Seite faellt bei einem
   * unbekannten Ort auf den ganzen Handlager zurueck (dort ist es nur eine
   * Anzeige); hier wuerde derselbe Rueckfall gegen einen ANDEREN Bestand
   * buchen als den, der gezaehlt wurde.
   */
  it("weist einen Ort ausserhalb des Handlagers ab, ohne etwas zu schreiben", async () => {
    legeArtikelAn("art-fremd");
    const zeilenVorher = t.db.select().from(buchungen).all().length;

    const erg = await inventurKorrektur({
      kommentar: "Fahrzeug", ortId: "rtw-1",
      positionen: [{ artikelId: "art-fremd", ist: 3 }],
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: INVENTUR_TEXTE.ortUnbekannt });
    expect(t.db.select().from(inventuren).all()).toHaveLength(0);
    expect(t.db.select().from(buchungen).all()).toHaveLength(zeilenVorher);
    expect(revalidiert).toEqual([]);
  });

  /**
   * Der Ortsname im Umfang kommt AUS DER DATENBANK, nicht aus der Nutzlast:
   * der Verlauf ist append-only, eine ungeprueefte Behauptung ueber den Ort
   * stuende dort unkorrigierbar.
   */
  it("schreibt den Ortsnamen in den Umfang — und laesst ihn ohne Ortswahl weg", async () => {
    legeArtikelAn("art-umfang");

    const mitOrt = await inventurKorrektur({
      kommentar: "Schrank 1", ortId: "schrank-1",
      positionen: [{ artikelId: "art-umfang", ist: 0 }],
    }, t.db);
    const wurzel = await inventurKorrektur({
      kommentar: "Nicht zugeordnet", ortId: HANDLAGER_ID,
      positionen: [{ artikelId: "art-umfang", ist: 0 }],
    }, t.db);
    const ohneOrt = await inventurKorrektur({
      kommentar: "Alles",
      positionen: [{ artikelId: "art-umfang", ist: 0 }],
    }, t.db);

    const id = (erg: unknown) => (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    expect(JSON.parse(umfangVon(id(mitOrt))!)).toEqual({ kategorien: [], faecher: [], ort: "Schrank 1" });
    // ⚠️ NICHT der Name des Lagerorts („Handlager") — der stuende fuer denselben
    // Bereich wie „ganzer Handlager", und im Verlauf waere beides nicht mehr
    // auseinanderzuhalten.
    expect(JSON.parse(umfangVon(id(wurzel))!)).toEqual({ kategorien: [], faecher: [], ort: "Nicht zugeordnet" });
    expect(umfangVon(id(ohneOrt))).toBeNull();
  });
});
