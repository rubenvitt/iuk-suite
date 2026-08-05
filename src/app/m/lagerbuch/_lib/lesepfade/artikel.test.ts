import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { artikelListe, artikelDetail, artikelDetailHelfer, chargenMitRest } from "./artikel";
import { HANDLAGER_ID } from "../konstanten";


/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-artikel-");
  t.db.insert(lagerorte).values(
    { id: "rtw", name: "RTW", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 20, aktiv: true, createdAt: NOW },
    { id: "a2", name: "Alt", einheit: "Stk.", fach: "Z9",
      mindestbestand: 0, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-spaet", artikelId: "a1", chargenNr: "CH-SPAET", verfall: "2028-01", createdAt: NOW },
    { id: "c-frueh", artikelId: "a1", chargenNr: "CH-FRUEH", verfall: "2026-07", createdAt: NOW },
    { id: "c-leer", artikelId: "a1", chargenNr: "CH-LEER", verfall: "2026-06", createdAt: NOW },
  ]).run();
  const b = (
    chargeId: string, lagerortId: string, menge: number,
    typ: "zugang" | "entnahme" | "korrektur" | "umlagerung" = "zugang",
  ) => ({
    id: newId(), ts: NOW, typ, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "test", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-spaet", HANDLAGER_ID, 5),
    b("c-frueh", HANDLAGER_ID, 7),
    b("c-frueh", "rtw", 4),                          // dieselbe Charge im Fahrzeug
    b("c-leer", HANDLAGER_ID, 2),
    b("c-leer", HANDLAGER_ID, -2, "entnahme"),       // aufgebraucht
  ]).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("chargenMitRest — Handlager als Vorgabe", () => {
  it("rechnet den Rest je Charge NUR im Handlager", () => {
    const cs = chargenMitRest(t.db, "a1");
    expect(new Map(cs.map((c) => [c.id, c.rest]))).toEqual(
      new Map([["c-spaet", 5], ["c-frueh", 7], ["c-leer", 0]]));
  });
  it("liefert auf Wunsch den Rest an einem anderen Lagerort", () => {
    expect(chargenMitRest(t.db, "a1", "rtw").find((c) => c.id === "c-frueh")?.rest).toBe(4);
  });
  it("nennt jede Charge, auch die aufgebrauchte — mit rest 0, nicht fehlend", () => {
    expect(chargenMitRest(t.db, "a1")).toHaveLength(3);
  });
});

describe("artikelListe", () => {
  it("zeigt den HANDLAGER-Bestand, nicht die Summe ueber alle Lagerorte", () => {
    // 5 + 7 + 0 = 12. Die 4 im RTW zaehlen NICHT (§5.2.1).
    expect(artikelListe(t.db, {}, NOW).find((z) => z.id === "a1")?.bestand).toBe(12);
  });

  it("blendet inaktive Artikel per Vorgabe aus", () => {
    expect(artikelListe(t.db, {}, NOW).map((z) => z.id)).toEqual(["a1"]);
    expect(artikelListe(t.db, { inklInaktiv: true }, NOW).map((z) => z.id).sort())
      .toEqual(["a1", "a2"]);
  });

  it("naechsteCharge ist die frueheste mit REST > 0", () => {
    // c-leer (2026-06) ist frueher, aber aufgebraucht → c-frueh (2026-07).
    expect(artikelListe(t.db, {}, NOW).find((z) => z.id === "a1")?.naechsteCharge)
      .toEqual({ chargenNr: "CH-FRUEH", verfall: "2026-07" });
  });

  it("rechnet unterMindest und chargeKritisch VOR", () => {
    // Der Client-Filter (T41) nimmt beides als Feld — eine Client-Insel darf keine
    // Ampel rechnen (§5.1, Falle 6).
    const z = artikelListe(t.db, {}, NOW).find((x) => x.id === "a1")!;
    expect(z.unterMindest).toBe(true);      // 12 < 20
    expect(z.chargeKritisch).toBe(true);    // 2026-07 ist gelb (Ampel != gruen)
  });

  it("liefert fuer einen Artikel ohne Buchung Bestand 0 und naechsteCharge null", () => {
    const z = artikelListe(t.db, { inklInaktiv: true }, NOW).find((x) => x.id === "a2")!;
    expect(z.bestand).toBe(0);
    expect(z.naechsteCharge).toBeNull();
    expect(z.unterMindest).toBe(false);     // 0 < 0 ist falsch (strikt)
  });
});

describe("artikelDetail", () => {
  it("zeigt den HANDLAGER-Bestand, aber den Verlauf LAGERORT-UEBERGREIFEND", () => {
    // `queries.ts:65-66`: der Verlauf zeigt auch Umlagerungen aufs Fahrzeug als
    // Aktivitaet. Wer ihn auf den Handlager filtert, macht Umlagerungen unsichtbar.
    const d = artikelDetail(t.db, "a1", NOW)!;
    expect(d.bestand).toBe(12);
    expect(d.buchungen).toHaveLength(5);
  });
  it("liefert null fuer eine unbekannte ID", () => {
    expect(artikelDetail(t.db, "gibtsnicht", NOW)).toBeNull();
  });
  it("deckelt den Verlauf auf acht Zeilen", () => {
    for (let i = 0; i < 10; i++) {
      t.db.insert(buchungen).values({
        id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c-spaet",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "t",
        referenz: null, kommentar: null,
      }).run();
    }
    expect(artikelDetail(t.db, "a1", NOW)!.buchungen).toHaveLength(8);
  });
});

describe("artikelDetailHelfer", () => {
  it("zeigt nur Chargen mit REST > 0, aufsteigend nach Verfall, mit Chip-Text", () => {
    const d = artikelDetailHelfer(t.db, "a1", NOW)!;
    expect(d.chargen.map((c) => c.id)).toEqual(["c-frueh", "c-spaet"]);
    // verfallStatus("2026-07", { rotTage: 31, gelbTage: 56 }, NOW): das
    // Monatsende (2026-07-31 23:59:59.999 Berlin = 21:59:59.999Z) liegt 47
    // aufgerundete Tage nach NOW (2026-06-15T10:00:00Z) — 47 > rotTage(31) und
    // <= gelbTage(56), also gelb, nicht rot. Nachgerechnet mit den
    // Repo-eigenen Funktionen `monatsEnde`/`verfallStatus` (T28, bereits
    // abgenommen); der Brief-Text nannte an dieser Stelle "rot", was mit den
    // hier gepinnten Schwellen und Daten rechnerisch nicht zutrifft.
    expect(d.chargen[0].ampel).toBe("gelb");
    expect(d.chargen[0].text).toBe("fällig 07/26");
    expect(d.bestand).toBe(12);
  });
  it("liefert null fuer eine unbekannte ID", () => {
    expect(artikelDetailHelfer(t.db, "x", NOW)).toBeNull();
  });
});
