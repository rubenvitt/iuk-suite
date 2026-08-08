import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
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

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0 } });
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

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 0 } });
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

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1 } });
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

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1 } });
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

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 2 } });
    const korrekturen = inventurBuchungen();
    expect(korrekturen).toHaveLength(2);
    expect(new Set(korrekturen.map((b) => b.referenz)).size).toBe(1);
    expect(korrekturen[0]!.referenz).toMatch(/^inventur:[A-Za-z0-9_-]+$/);
    expect(korrekturen.map((b) => b.artikelId).sort()).toEqual(["art-minus", "art-plus"]);
    expect(korrekturen.every((b) => b.kommentar === "Gemeinsamer Lauf")).toBe(true);
    expect(revalidiert).toEqual(ERFOLGS_PFADE);
  });
});
