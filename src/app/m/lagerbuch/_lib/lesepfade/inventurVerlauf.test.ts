import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";

/**
 * DRK-299 — der Verlauf abgeschlossener Inventuren. Die Fixture laeuft ueber die
 * ECHTE Action, damit Lese- und Schreibpfad dieselbe Form haben.
 *
 * ⚠️ `inventuren.ts` sind UNIX-SEKUNDEN, und die Action stempelt `new Date()`
 * selbst. Zwei Laeufe im selben Test landen fast immer in derselben Sekunde —
 * dann entschiede die Zweitsortierung nach einer ZUFAELLIGEN nanoid, und
 * „neueste zuerst" waere zur Haelfte rot. Deshalb wird nur `Date` gefaelscht
 * und die Uhr vor jedem Lauf um eine Minute vorgestellt.
 */

const { adminRiegel } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("../zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { inventurKorrektur } from "../../_actions/inventur";
import { inventurLauf, inventurLaeufe, umfangAus, umfangText } from "./inventurVerlauf";

const VIEWER = { sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };
const JETZT = new Date("2026-07-15T10:00:00Z");

let t: TestDb;
let buchungNr = 0;
let uhr = JETZT.getTime();

beforeEach(() => {
  buchungNr = 0;
  uhr = JETZT.getTime();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(uhr);
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-lesepfad-inventur-verlauf-");
});

afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function legeArtikelAn(id: string, name = id): void {
  t.db.insert(artikel).values({
    id, name, einheit: "Stk.", fach: `Fach ${id}`, mindestbestand: 0,
    aktiv: true, bestelltAt: null, createdAt: JETZT,
  }).run();
}

function legeChargeAn(args: { id: string; artikelId: string; verfall: string; chargenNr?: string }): void {
  t.db.insert(chargen).values({
    id: args.id, artikelId: args.artikelId, chargenNr: args.chargenNr ?? args.id,
    verfall: args.verfall, createdAt: JETZT,
  }).run();
}

function buche(args: { artikelId: string; chargeId: string; menge: number }): void {
  t.db.insert(buchungen).values({
    id: `fixture-buchung-${++buchungNr}`, ts: JETZT, typ: "zugang",
    artikelId: args.artikelId, chargeId: args.chargeId, lagerortId: HANDLAGER_ID,
    menge: args.menge, quelleTyp: "system", quelleId: "fixture", referenz: null, kommentar: null,
  }).run();
}

/** Die Uhr eine Minute vorstellen — jeder Lauf bekommt eine eigene Sekunde. */
function naechsterLauf(): void {
  uhr += 60_000;
  vi.setSystemTime(uhr);
}

/** art-1 (Bestand 5, Charge c-1 „L1"/2027-01) und art-2 (Bestand 2). */
function legeBestandAn(): void {
  legeArtikelAn("art-1");
  legeArtikelAn("art-2");
  legeChargeAn({ id: "c-1", artikelId: "art-1", verfall: "2027-01", chargenNr: "L1" });
  legeChargeAn({ id: "c-2", artikelId: "art-2", verfall: "2028-01", chargenNr: "L2" });
  buche({ artikelId: "art-1", chargeId: "c-1", menge: 5 });
  buche({ artikelId: "art-2", chargeId: "c-2", menge: 2 });
}

describe("inventurLaeufe", () => {
  it("liefert neueste zuerst mit Zahl der Positionen und Abweichungen", async () => {
    legeBestandAn();
    naechsterLauf();
    await inventurKorrektur({ kommentar: "Erster", positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    naechsterLauf();
    await inventurKorrektur({
      kommentar: "Zweiter", umfang: { kategorien: ["Hygiene"], faecher: [] },
      positionen: [{ artikelId: "art-1", ist: 5 }, { artikelId: "art-2", ist: 1 }],
    }, t.db);

    const { laeufe, begrenzt } = inventurLaeufe(t.db);
    expect(begrenzt).toBe(false);
    expect(laeufe.map((l) => [l.kommentar, l.positionen, l.abweichungen])).toEqual([
      ["Zweiter", 2, 1],
      ["Erster", 1, 0],
    ]);
    expect(laeufe[0]!.umfang).toEqual({ kategorien: ["Hygiene"], faecher: [], ort: null });
    expect(laeufe[1]!.umfang).toBeNull();
    expect(laeufe[0]!.quelleTyp).toBe("oidc");
    expect(laeufe[0]!.quelleId).toBe("u-admin");
  });

  it("zeigt einen Lauf ohne Abweichung — genau das konnte das Journal nicht", async () => {
    legeBestandAn();
    await inventurKorrektur({ kommentar: "Stimmt", positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    expect(inventurLaeufe(t.db).laeufe).toHaveLength(1);
  });

  it("begrenzt und meldet das", async () => {
    legeBestandAn();
    for (const k of ["a", "b", "c"]) {
      naechsterLauf();
      await inventurKorrektur({ kommentar: k, positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    }
    const { laeufe, begrenzt } = inventurLaeufe(t.db, 2);
    expect(laeufe).toHaveLength(2);
    expect(laeufe.map((l) => l.kommentar)).toEqual(["c", "b"]);
    expect(begrenzt).toBe(true);
  });

  it("meldet keine Begrenzung, wenn genau die Grenze erreicht ist", async () => {
    legeBestandAn();
    for (const k of ["a", "b"]) {
      naechsterLauf();
      await inventurKorrektur({ kommentar: k, positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    }
    expect(inventurLaeufe(t.db, 2).begrenzt).toBe(false);
  });
});

describe("inventurLauf", () => {
  it("liefert Positionen mit Artikelname und Charge, Artikelpositionen ohne Charge", async () => {
    legeBestandAn();
    const erg = await inventurKorrektur({
      kommentar: "Detail",
      positionen: [
        { artikelId: "art-1", chargen: [{ chargeId: "c-1", ist: 4 }], neu: [] },
        { artikelId: "art-2", ist: 2 },
      ],
    }, t.db);
    const id = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    const lauf = inventurLauf(t.db, id)!;
    expect(lauf.kopf.kommentar).toBe("Detail");
    expect(lauf.kopf.positionen).toBe(2);
    expect(lauf.kopf.abweichungen).toBe(1);
    expect(lauf.positionen.map((p) => [p.artikelName, p.chargenNr, p.verfall, p.erwartet, p.gezaehlt])).toEqual([
      ["art-1", "L1", "2027-01", 5, 4],
      ["art-2", null, null, 2, 2],
    ]);
    expect(lauf.positionen[1]!.chargeId).toBeNull();
  });

  it("liefert null für eine unbekannte ID", () => {
    expect(inventurLauf(t.db, "gibt-es-nicht")).toBeNull();
  });

  it("macht aus kaputtem umfang null statt eines Wurfs", () => {
    expect(umfangAus("{kaputt")).toBeNull();
    expect(umfangAus(null)).toBeNull();
  });

  /**
   * DRK-337 — der Ort im Umfang. ⚠️ EIN LAUF VOR DRK-337 HAT DAS FELD NICHT,
   * und der Verlauf ist append-only: `ort: null` ist dort die WAHRE Antwort
   * („ganzer Handlager"), kein fehlender Wert. Ein `undefined` an dieser Stelle
   * liesse `umfangText` „Ort undefined" schreiben.
   */
  it("liest den Ort aus dem Umfang und laesst Altlaeufe ohne Ort gelten", () => {
    expect(umfangAus('{"kategorien":[],"faecher":[],"ort":"Schrank 1"}'))
      .toEqual({ kategorien: [], faecher: [], ort: "Schrank 1" });
    expect(umfangAus('{"kategorien":["Hygiene"],"faecher":["A1"]}'))
      .toEqual({ kategorien: ["Hygiene"], faecher: ["A1"], ort: null });
    // Ein leerer Ortsname ist kein Ort — sonst stuende „Ort " im Verlauf.
    expect(umfangAus('{"kategorien":[],"faecher":[],"ort":""}')?.ort).toBeNull();
    expect(umfangAus('{"kategorien":[],"faecher":[],"ort":42}')?.ort).toBeNull();
  });

  it("nennt den Ort zuerst und faellt ohne jede Angabe auf vollstaendig zurueck", () => {
    expect(umfangText({ kategorien: ["Hygiene"], faecher: ["A1"], ort: "Schrank 1" }))
      .toBe("Ort Schrank 1, Hygiene, Fach A1");
    expect(umfangText({ kategorien: [], faecher: [], ort: "Nicht zugeordnet" }))
      .toBe("Ort Nicht zugeordnet");
    expect(umfangText({ kategorien: [], faecher: [], ort: null })).toBe("vollständig");
    expect(umfangText(null)).toBe("vollständig");
  });
});
