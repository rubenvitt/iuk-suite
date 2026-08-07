import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { artikelListe, artikelDetail, artikelDetailHelfer, chargenMitRest } from "./artikel";
import { ARTIKEL_VERLAUF_GRENZE } from "../grenzen";
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

function chargeMitRest(
  id: string,
  chargenNr: string,
  verfall: string,
  createdAt: Date,
  menge = 1,
): void {
  t.db.insert(chargen).values({ id, artikelId: "a1", chargenNr, verfall, createdAt }).run();
  t.db.insert(buchungen).values({
    id: `b-${id}`,
    ts: createdAt,
    typ: "zugang",
    artikelId: "a1",
    chargeId: id,
    lagerortId: HANDLAGER_ID,
    menge,
    quelleTyp: "system",
    quelleId: "test",
    referenz: null,
    kommentar: null,
  }).run();
}

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
    expect(z.chargeKritisch).toBe(false);   // keine Charge → keine Ampel
  });

  it("waehlt bei gleichem Verfall die aeltere createdAt-Charge gegen die ID-Reihenfolge", () => {
    // Neuere Charge zuerst: ohne createdAt-Stufe bliebe sie durch stabile Sortierung vorn.
    chargeMitRest("aaa-neu", "NEU", "2026-01", new Date("2026-01-02T00:00:00Z"));
    chargeMitRest("zzz-alt", "ALT", "2026-01", new Date("2026-01-01T00:00:00Z"));

    expect(artikelListe(t.db, {}, NOW)[0]?.naechsteCharge)
      .toEqual({ chargenNr: "ALT", verfall: "2026-01" });
  });

  it("waehlt bei gleichem Verfall und createdAt die kleinere Charge-ID", () => {
    const gleich = new Date("2026-01-01T00:00:00Z");
    // Verlierer zuerst: ohne ID-Tiebreaker bliebe `zzz` durch stabile Sortierung vorn.
    chargeMitRest("zzz", "ID-Z", "2026-01", gleich);
    chargeMitRest("aaa", "ID-A", "2026-01", gleich);

    expect(artikelListe(t.db, {}, NOW)[0]?.naechsteCharge)
      .toEqual({ chargenNr: "ID-A", verfall: "2026-01" });
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
  it("deckelt den Verlauf auf ARTIKEL_VERLAUF_GRENZE Zeilen und meldet mehrVorhanden", () => {
    for (let i = 0; i < 10; i++) {
      t.db.insert(buchungen).values({
        id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c-spaet",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "t",
        referenz: null, kommentar: null,
      }).run();
    }
    const d = artikelDetail(t.db, "a1", NOW)!;
    expect(d.buchungen).toHaveLength(ARTIKEL_VERLAUF_GRENZE);
    expect(d.mehrVorhanden).toBe(true);
  });

  it("meldet bei EXAKT ARTIKEL_VERLAUF_GRENZE Zeilen mehrVorhanden FALSE", () => {
    /**
     * ⚠️ DER GEGENFALL. Ohne ihn ueberlebt die Mutation
     * `bu.length > GRENZE` → `>= GRENZE`, und die Seite behauptete „die neuesten
     * 8 von mehr", obwohl die Grenze nicht griff — genau die unbedingte
     * Fehlaussage, gegen die §5.14.3 gebaut ist.
     *
     * Die Fixture traegt bereits 5 Buchungen, also werden 3 ergaenzt.
     */
    for (let i = 0; i < ARTIKEL_VERLAUF_GRENZE - 5; i++) {
      t.db.insert(buchungen).values({
        id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c-spaet",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "t",
        referenz: null, kommentar: null,
      }).run();
    }
    const d = artikelDetail(t.db, "a1", NOW)!;
    expect(d.buchungen).toHaveLength(ARTIKEL_VERLAUF_GRENZE);
    expect(d.mehrVorhanden).toBe(false);
  });

  it("zeigt die NEUESTEN Buchungen zuerst — ts absteigend, id-Tiebreaker absteigend", () => {
    /**
     * ⚠️ DIE SORTIERRICHTUNG WAR UNGETESTET. Beide Faelle prueften nur
     * `toHaveLength`; ein invertiertes oder geloeschtes `orderBy` blieb gruen —
     * die Seite zeigte dann die AELTESTEN acht unter der Ueberschrift „die
     * neuesten".
     *
     * Drei verschiedene `ts` UND ein `ts`-Gleichstand: die beiden Zeilen mit
     * demselben Zeitstempel („glA"/„glB") sind LOSER-FIRST eingefuegt, also
     * entscheidet nur der id-Tiebreaker. Alle vier liegen NACH den fuenf
     * Fixture-Buchungen (die auf NOW stehen), damit sie oben stehen muessen.
     */
    const spaeter = (min: number) => new Date(NOW.getTime() + min * 60_000);
    const z = (id: string, ts: Date) => ({
      id, ts, typ: "zugang" as const, artikelId: "a1", chargeId: "c-spaet",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system" as const, quelleId: "t",
      referenz: null, kommentar: id,
    });
    t.db.insert(buchungen).values([
      z("mitte", spaeter(20)),
      z("gl-a", spaeter(30)),       // Gleichstand, KLEINERE id — zuerst eingefuegt
      z("gl-b", spaeter(30)),       // Gleichstand, GROESSERE id — muss gewinnen
      z("aelteste", spaeter(10)),
    ]).run();
    const d = artikelDetail(t.db, "a1", NOW)!;
    expect(d.buchungen.slice(0, 4).map((b) => b.id))
      .toEqual(["gl-b", "gl-a", "mitte", "aelteste"]);
    expect(d.buchungen[0]).toMatchObject({
      id: "gl-b",
      quelleTyp: "system",
      quelleId: "t",
    });
    expect(d.mehrVorhanden).toBe(true);
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

  it("ordnet Detail und Helfer dreistufig wie FEFO, ohne createdAt offenzulegen", () => {
    const alt = new Date("2026-01-01T00:00:00Z");
    const neu = new Date("2026-01-02T00:00:00Z");
    const gleich = new Date("2026-01-03T00:00:00Z");
    // Beide Verlierer zuerst, damit weder stabile Eingabereihenfolge noch ID
    // die createdAt- und ID-Stufen vortaeuschen.
    chargeMitRest("aaa-neu", "NEU", "2026-01", neu);
    chargeMitRest("zzz-alt", "ALT", "2026-01", alt);
    chargeMitRest("bbb-gleich", "ID-B", "2026-01", gleich);
    chargeMitRest("aaa-gleich", "ID-A", "2026-01", gleich);

    const erwartet = ["zzz-alt", "aaa-neu", "aaa-gleich", "bbb-gleich"];
    const detail = artikelDetail(t.db, "a1", NOW)!;
    const helfer = artikelDetailHelfer(t.db, "a1", NOW)!;

    expect(detail.chargen.slice(0, 4).map((charge) => charge.id)).toEqual(erwartet);
    expect(helfer.chargen.slice(0, 4).map((charge) => charge.id)).toEqual(erwartet);
    expect(detail.chargen[0]).not.toHaveProperty("createdAt");
    expect(helfer.chargen[0]).not.toHaveProperty("createdAt");
  });
});
