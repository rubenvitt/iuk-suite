import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import {
  artikelListe, artikelDetail, artikelDetailHelfer, artikelDetailAuffuellen,
  chargenMitRest, chargenJeArtikelAmLagerort,
} from "./artikel";
import { restJeChargeAnOrt } from "./bestand";
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
  /**
   * DRK-354 — DER DRITTE PARAMETER IST WEG (`chargenMitRest` ist jetzt
   * handlager-gebunden). Was er konnte, kann `restJeChargeAnOrt` genauer: er
   * nimmt eine ID statt einer Liste, in die der Handlager-Bereich ebenso
   * hineingepasst haette.
   */
  it("den Rest an einem anderen Lagerort liefert restJeChargeAnOrt", () => {
    expect(restJeChargeAnOrt(t.db, "rtw").get("c-frueh")).toBe(4);
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

describe("artikelDetailHelfer — Verteilung ueber mehrere Orte (DRK-297, Aufgabe 12)", () => {
  /**
   * Eigene Artikel/Ort-Fixtures, additiv zu "a1" oben — dieselbe Form wie
   * `_actions/detail.test.ts` (Aufgabe 11): ein Schrank mit Zugangshinweis
   * und ein Fahrzeug, damit dieselbe Charge an zwei Orten bzw. NUR im
   * Fahrzeug liegen kann.
   */
  const ARTIKEL_A = "art-a";
  const RTW1 = "rtw-1";
  const SCHRANK_GF = "schrank-gf";

  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: RTW1, name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1",
        // DRK-309: MIT Art — die Gegenprobe zum Zwischenstand, den
        // `_actions/detail.test.ts` an derselben Verteilung abdeckt.
        einheitenart: "fahrzeug", aktiv: true },
      {
        id: SCHRANK_GF, name: "GF-Schrank", typ: "lager", parentId: HANDLAGER_ID,
        zugangshinweis: "Zugang über LvD — anrufen", sortierung: 90, aktiv: true,
      },
    ]).run();
    t.db.insert(artikel).values({
      id: ARTIKEL_A, name: "Verbandmull", einheit: "Pkg.", fach: "B-2",
      mindestbestand: 3, aktiv: true, createdAt: NOW,
    }).run();
    t.db.insert(chargen).values([
      { id: "c-gf1", artikelId: ARTIKEL_A, chargenNr: "GF-1", verfall: "2027-01", createdAt: NOW },
      { id: "c-r9", artikelId: ARTIKEL_A, chargenNr: "R-9", verfall: "2027-01", createdAt: NOW },
      // Liegt in BEIDEN: dem GF-Schrank (sortierung 90) UND dem RTW (sortierung
      // 0 als Fahrzeug-Default) — derselbe Fall wie "MIX" in
      // `_actions/detail.test.ts` (Aufgabe 11). Ohne den Rang VOR der
      // Sortierung stuende das Fahrzeug faelschlich zuerst.
      { id: "c-mix", artikelId: ARTIKEL_A, chargenNr: "MIX", verfall: "2027-01", createdAt: NOW },
    ]).run();
    t.db.insert(buchungen).values([
      { id: "b-gf1", ts: NOW, typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-gf1",
        lagerortId: SCHRANK_GF, menge: 3, quelleTyp: "system", quelleId: "import",
        referenz: null, kommentar: null },
      { id: "b-r9", ts: NOW, typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-r9",
        lagerortId: RTW1, menge: 7, quelleTyp: "system", quelleId: "import",
        referenz: null, kommentar: null },
      { id: "b-mix-gf", ts: NOW, typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-mix",
        lagerortId: SCHRANK_GF, menge: 4, quelleTyp: "system", quelleId: "import",
        referenz: null, kommentar: null },
      { id: "b-mix-rtw", ts: NOW, typ: "zugang", artikelId: ARTIKEL_A, chargeId: "c-mix",
        lagerortId: RTW1, menge: 6, quelleTyp: "system", quelleId: "import",
        referenz: null, kommentar: null },
    ]).run();
  });

  it("nennt der Helferin den Schrank und den Zugangshinweis", () => {
    const d = artikelDetailHelfer(t.db, ARTIKEL_A, NOW)!;
    const charge = d.chargen.find((c) => c.chargenNr === "GF-1")!;
    expect(charge.orte[0]?.name).toBe("GF-Schrank");
    expect(charge.orte[0]?.zugangshinweis).toBe("Zugang über LvD — anrufen");
  });

  /** Wer vor dem Regal steht, soll auch sehen, was im Fahrzeug liegt. */
  it("zeigt auch Chargen, die nur im Fahrzeug liegen", () => {
    const d = artikelDetailHelfer(t.db, ARTIKEL_A, NOW)!;
    expect(d.chargen.map((c) => c.chargenNr)).toContain("R-9");
  });

  /**
   * DRK-297, Fixrunde 1 — genau der Fall, fuer den die `rang`-Regel existiert:
   * eine Charge liegt AN BEIDEN, einem Schrank (sortierung 90, Handlager-
   * Bereich) UND einem Fahrzeug (sortierung 0 als Default). Ohne den Rang
   * VOR der Sortierung stuende das Fahrzeug faelschlich zuerst.
   */
  it("stellt den Handlager-Bereich vor Fahrzeugen, auch wenn die Sortierung anders liefe", () => {
    const d = artikelDetailHelfer(t.db, ARTIKEL_A, NOW)!;
    const charge = d.chargen.find((c) => c.chargenNr === "MIX")!;
    expect(charge.orte).toEqual([
      {
        id: SCHRANK_GF, name: "GF-Schrank", menge: 4,
        zugangshinweis: "Zugang über LvD — anrufen",
        typ: "lager", kennung: null, einheitenart: null,
      },
      {
        id: RTW1, name: "RTW 1", menge: 6, zugangshinweis: null,
        typ: "fahrzeug", kennung: "MS-DRK-1", einheitenart: "fahrzeug",
      },
    ]);
    expect(charge.restGesamt).toBe(10);
  });
});

describe("artikelDetailAuffuellen (DRK-313)", () => {
  /**
   * ⚠️ DER UNTERSCHIED ZU `artikelDetailHelfer` IST EIN FILTER, UND ER
   * ENTSCHEIDET UEBER EINEN STILLEN DATENFEHLER (Codex-Befund P1 zu PR #174).
   *
   * `c-leer` ist ueberall aufgebraucht. Fuer die ENTNAHME ist sie zu Recht
   * weg — was nirgends liegt, kann man nicht mitnehmen. Fuers ANNEHMEN muss
   * sie DA sein: kommt Nachschub aus demselben Los, waere sie sonst nicht
   * waehlbar, und die einzige Ausweichform waere „Neue Charge" mit derselben
   * Nummer und demselben Verfall — also eine zweite, in FEFO nicht
   * unterscheidbare Zeile.
   *
   * Die beiden Zusicherungen stehen ABSICHTLICH nebeneinander: „enthaelt
   * c-leer" allein waere auch dann gruen, wenn jemand den Filter im
   * Helfer-Weg entfernte — und der gehoert dort hin.
   */
  it("fuehrt die aufgebrauchte Charge, die der Entnahmeweg ausblendet", () => {
    const auffuellen = artikelDetailAuffuellen(t.db, "a1", NOW)!;
    const helfer = artikelDetailHelfer(t.db, "a1", NOW)!;

    expect(auffuellen.chargen.map((c) => c.id)).toContain("c-leer");
    expect(helfer.chargen.map((c) => c.id)).not.toContain("c-leer");
  });

  it("zeigt den Handlager-Rest, und `0` ist dort eine Aussage", () => {
    const d = artikelDetailAuffuellen(t.db, "a1", NOW)!;
    expect(d.chargen.find((c) => c.id === "c-leer")?.rest).toBe(0);
    // `c-frueh` liegt 7 im Handlager und 4 im Fahrzeug — gezeigt wird der
    // Handlager-Rest, dieselbe Sprache wie die Kopfzahl.
    expect(d.chargen.find((c) => c.id === "c-frueh")?.rest).toBe(7);
  });

  it("ordnet FEFO — dieselbe Reihenfolge wie der Entnahmeweg", () => {
    const auffuellen = artikelDetailAuffuellen(t.db, "a1", NOW)!;
    const helfer = artikelDetailHelfer(t.db, "a1", NOW)!;
    // Beide kommen aus `chargenMitRest`; nur eine davon wird danach gefiltert.
    expect(auffuellen.chargen.map((c) => c.id).filter((id) => id !== "c-leer"))
      .toEqual(helfer.chargen.map((c) => c.id));
    expect(auffuellen.chargen.map((c) => c.id)).toEqual(["c-leer", "c-frueh", "c-spaet"]);
  });

  /** Eine abgelaufene Charge wird NICHT versteckt, sondern als abgelaufen
   *  gezeigt — verstecken waere dieselbe Sorte Fehler wie das Filtern. */
  it("traegt Ampel und Text je Charge", () => {
    const d = artikelDetailAuffuellen(t.db, "a1", NOW)!;
    const leer = d.chargen.find((c) => c.id === "c-leer")!;
    expect(leer.ampel).toBe("rot");
    expect(leer.text).toBeTruthy();
  });

  it("liefert `null` fuer einen unbekannten Artikel", () => {
    expect(artikelDetailAuffuellen(t.db, "x", NOW)).toBeNull();
  });
});

describe("chargenJeArtikelAmLagerort", () => {
  it("liefert je Artikel nur die Chargen mit Rest AN DIESEM Lagerort", () => {
    const karte = chargenJeArtikelAmLagerort(t.db, "rtw");

    // c-frueh liegt mit 4 im RTW; c-spaet und c-leer nur (bzw. gar nicht) im Handlager.
    expect(karte.get("a1")?.map((c) => [c.id, c.rest])).toEqual([["c-frueh", 4]]);
  });

  it("nennt einen Lagerort ohne Bestand gar nicht", () => {
    expect(chargenJeArtikelAmLagerort(t.db, "rtw").has("a2")).toBe(false);
  });

  it("sortiert die Chargen eines Artikels FEFO", () => {
    const b = {
      id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1",
      chargeId: "c-spaet", lagerortId: "rtw", menge: 3,
      quelleTyp: "system" as const, quelleId: "test", referenz: null, kommentar: null,
    };
    t.db.insert(buchungen).values(b).run();

    // 2026-07 vor 2028-01 — dieselbe Ordnung, die die Abbuchung daneben waehlt.
    expect(chargenJeArtikelAmLagerort(t.db, "rtw").get("a1")?.map((c) => c.id))
      .toEqual(["c-frueh", "c-spaet"]);
  });
});
