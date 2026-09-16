import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  artikel, buchungen, chargen, lagerorte, lagerortVerfall, sollPositionen,
} from "../../_db/schema";
import {
  bereinigeVerfallOhneAktivesSoll, loescheVerfallEintrag, loescheVerfallFuer,
  setzeVerfall, uebernimmVerfall, verfallFolgtDemMaterial,
} from "./lagerortVerfall";
import { ENTNAHMEBOX_ID } from "../konstanten";
import type { Quelle } from "./abbuchung";

const NOW = new Date("2026-06-15T10:00:00Z");
const SPAETER = new Date("2026-06-20T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-lvf-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true },
    { id: "rtw-2", name: "RTW 2", typ: "fahrzeug", kennung: null, aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "A", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "B", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const alle = () => t.db.select().from(lagerortVerfall).all();

describe("setzeVerfall — der Upsert", () => {
  it("legt eine Angabe an", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({ verfall: "2026-09", quelleTyp: "token" });
  });

  it("UEBERSCHREIBT eine bestehende Angabe, statt zu duplizieren", () => {
    /**
     * §4.11: der Upsert laeuft ueber den Unique-Index
     * `idx_lagerort_verfall_ort_artikel`. Die ALTE ANGABE IST DANACH WEG — es gibt
     * keine Historie und keinen Trigger. Das ist gewollt: ein Fahrzeug hat einen
     * aktuellen fruehesten Verfall, keine Verlaufskurve.
     */
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    const idVorher = alle()[0].id;
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: SPAETER });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({
      verfall: "2026-07", quelleTyp: "oidc", quelleId: "sub-1",
    });
    expect(alle()[0].erfasstAt.getTime()).toBe(SPAETER.getTime());
    // ⚠️ DIE ZEILE, UM DIE ES GEHT: `id` bleibt IDENTISCH. `INSERT OR REPLACE`
    // loeschte die Zeile und legte sie mit einer NEUEN `id` neu an — das waere
    // an jeder anderen Zusicherung dieses Tests nicht zu unterscheiden.
    expect(alle()[0].id).toBe(idVorher);
  });

  it("fuehrt (Lagerort, Artikel) als Paar — zwei Fahrzeuge, zwei Zeilen", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-2", artikelId: "a1",
      verfall: "2026-10", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(2);
  });
});

describe("setzeVerfall — null und '' LOESCHEN", () => {
  it("nimmt eine Angabe zurueck", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("behandelt den leeren String wie null", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "", quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("ist auf einer nicht vorhandenen Zeile ein No-Op", () => {
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: NOW })).not.toThrow();
  });
});

describe("setzeVerfall — genau EIN Monatsvalidator (§5.6.4, Entscheidung 6)", () => {
  it("lehnt '2026-00' ab — der laxe Ausdruck liesse ihn durch", () => {
    /**
     * `/^\d{4}-\d{2}$/` (`buchung.ts:17`, `bz.ts:83`) laesst „2026-00" durch;
     * `verfallStatus` rechnet daraus den 31.12.2025, und die Charge gilt AB DEM
     * ANLEGEN als abgelaufen. Ab jetzt gilt ueberall MONAT_REGEX.
     */
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-00", quelle: QUELLE, jetzt: NOW })).toThrow(/YYYY-MM/);
    expect(alle()).toHaveLength(0);
  });

  it("lehnt '2026-13' und Freitext ab", () => {
    for (const roh of ["2026-13", "2026-6", "Juni 2026", "2026"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).toThrow();
    }
  });

  it("nimmt '2026-01' und '2026-12' an", () => {
    for (const roh of ["2026-01", "2026-12", "2099-12"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).not.toThrow();
    }
  });
});

describe("die beiden Loeschwege", () => {
  beforeEach(() => {
    for (const [ort, art] of [["rtw-1", "a1"], ["rtw-1", "a2"], ["rtw-2", "a1"]] as const) {
      setzeVerfall(t.db, { lagerortId: ort, artikelId: art,
        verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    }
  });

  it("loescheVerfallEintrag trifft genau EIN Paar", () => {
    // Der Weg, den `fahrzeuge.ts:80` geht, wenn ein Artikel an diesem Fahrzeug
    // aus dem Soll faellt. Die verbleibenden zwei Zeilen sind NAMENTLICH die
    // beiden Nachbarn (gleicher Lagerort, gleicher Artikel) — nicht nur eine
    // Anzahl, die zufaellig stimmt.
    loescheVerfallEintrag(t.db, "rtw-1", "a1");
    expect(alle().map((r) => `${r.lagerortId}/${r.artikelId}`).sort()).toEqual([
      "rtw-1/a2", "rtw-2/a1",
    ]);
  });

  it("loescheVerfallFuer('lagerort') raeumt ein ganzes Fahrzeug ab", () => {
    loescheVerfallFuer(t.db, "lagerort", "rtw-1");
    expect(alle().map((r) => r.lagerortId)).toEqual(["rtw-2"]);
  });

  it("loescheVerfallFuer('artikel') raeumt einen Artikel ueberall ab", () => {
    loescheVerfallFuer(t.db, "artikel", "a1");
    expect(alle().map((r) => r.artikelId)).toEqual(["a2"]);
  });
});

describe("uebernimmVerfall — die Angabe wandert mit dem Material (DRK-377)", () => {
  /*
   * ⚠️ DAS ZIEL IST DIE ENTNAHMEBOX, UND ZWAR DIE AUS DER MIGRATION. Sie ist
   * der eine Ort ohne Soll, an dem die Tabelle heute ueberhaupt etwas tragen
   * muss — eine von Hand angelegte Lagerzeile daneben pruefte einen Ort, den es
   * so nicht gibt.
   */
  it("legt die Angabe am Zielort an und laesst die Quelle unangetastet", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });

    uebernimmVerfall(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    // ⚠️ UEBERNEHMEN IST NICHT VERSCHIEBEN. Ob die Quellzeile danach noch
    // gebraucht wird, entscheidet der AUFRUFER am verbleibenden Bestand —
    // diese Funktion weiss davon nichts und darf deshalb nichts wegnehmen.
    expect(alle().map((z) => z.lagerortId).sort()).toEqual([ENTNAHMEBOX_ID, "rtw-1"]);
  });

  it("uebernimmt Datum, Meldezeitpunkt und Quelle unveraendert", () => {
    // Eine Meldung ist die Ablesung eines Menschen. Stempelte die Uebernahme
    // „jetzt" darauf, stuende unter „Gemeldet" ein Tag, an dem niemand
    // hingesehen hat.
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: NOW });

    uebernimmVerfall(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    const ziel = alle().find((z) => z.lagerortId === ENTNAHMEBOX_ID);
    expect(ziel).toMatchObject({
      verfall: "2026-09", quelleTyp: "oidc", quelleId: "sub-1",
    });
    expect(ziel?.erfasstAt.getTime()).toBe(NOW.getTime());
  });

  it("behaelt das FRUEHERE Datum, wenn am Ziel schon eines steht", () => {
    // Betreiberentscheidung zu DRK-377: der Zielort traegt je Artikel EINEN
    // Wert, und die Tabelle bedeutet „das frueheste Datum, das hier auf einer
    // Packung steht". Die sichere Richtung ist, eher zu frueh zu warnen.
    setzeVerfall(t.db, { lagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
      verfall: "2026-07", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: SPAETER });

    uebernimmVerfall(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    const ziel = alle().find((z) => z.lagerortId === ENTNAHMEBOX_ID);
    // ⚠️ AUCH DIE QUELLE BLEIBT DIE DES FRUEHEREN DATUMS. Zeile und Meldung
    // gehoeren zusammen; ein Datum aus der einen Ablesung mit dem Zeitpunkt der
    // anderen waere eine Zuschreibung, die es nie gab.
    expect(ziel).toMatchObject({ verfall: "2026-07", quelleTyp: "token" });
    expect(ziel?.erfasstAt.getTime()).toBe(NOW.getTime());
  });

  it("ersetzt ein SPAETERES Datum am Ziel", () => {
    setzeVerfall(t.db, { lagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
      verfall: "2028-11", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-10", quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: SPAETER });

    uebernimmVerfall(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle().filter((z) => z.lagerortId === ENTNAHMEBOX_ID))
      .toMatchObject([{ verfall: "2026-10", quelleId: "sub-1" }]);
  });

  it("ist ohne Quellzeile ein No-Op — und LOESCHT am Ziel nichts", () => {
    // ⚠️ DER GEGENFEHLER WAERE STILL UND TEUER: Material ohne gemeldeten
    // Verfall dazuzulegen sagt nichts darueber aus, was schon in der Kiste
    // liegt. Ein „uebernimm nichts" als „setze auf nichts" zu lesen loeschte
    // die Meldung der vorherigen Herkunft.
    setzeVerfall(t.db, { lagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
      verfall: "2026-07", quelle: QUELLE, jetzt: NOW });

    uebernimmVerfall(t.db, {
      vonLagerortId: "rtw-2", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle()).toMatchObject([{ lagerortId: ENTNAHMEBOX_ID, verfall: "2026-07" }]);
  });
});

describe("verfallFolgtDemMaterial — Uebernahme UND Abraeumen in einem (DRK-377)", () => {
  /*
   * ⚠️ DIE ZWEI SCHRITTE STEHEN HIER ZUSAMMEN, WEIL SIE ZUSAMMENGEHOEREN. Der
   * zweite ist der, den man vergisst, und sein Fehlen ist still: die geleerte
   * Einheit meldet ihren Artikel weiter als ablaufend. Genau daran fuhr der
   * lokale Seed vorbei, solange die Regel als zwei Zeilen in der Action stand
   * (Codex zu PR #194, P2).
   *
   * Der Bestand wird hier ueber `buchungen` gestellt, weil die Funktion ihn
   * NACHLIEST — eine Attrappe prueefte die Rechnung, nicht die Regel.
   */
  function buchen(id: string, ort: string, menge: number) {
    t.db.insert(buchungen).values({
      id, ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "ch-1",
      lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
      referenz: null, kommentar: null,
    }).run();
  }

  beforeEach(() => {
    t.db.insert(chargen).values({
      id: "ch-1", artikelId: "a1", chargenNr: "L-1", verfall: "2030-01", createdAt: NOW,
    }).run();
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
  });

  it("traegt die Angabe in die Box und raeumt die LEERE Einheit ab", () => {
    buchen("b-1", "rtw-1", 0);   // nichts mehr da

    verfallFolgtDemMaterial(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle()).toMatchObject([{ lagerortId: ENTNAHMEBOX_ID, verfall: "2026-09" }]);
  });

  it("laesst sie an der Einheit stehen, solange dort noch etwas liegt", () => {
    // ⚠️ DIE GEGENPROBE, und sie ist der teurere Fehler: eine zu frueh
    // geloeschte Angabe nimmt eine gepflegte Information weg, ohne dass es
    // jemand merkt. Dass sie jetzt AUCH in der Box steht, macht sie an der
    // Einheit nicht falsch.
    buchen("b-1", "rtw-1", 4);

    verfallFolgtDemMaterial(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle().map((z) => z.lagerortId).sort()).toEqual([ENTNAHMEBOX_ID, "rtw-1"]);
  });

  it("zaehlt einen NEGATIVEN Chargensaldo nicht als Leere", () => {
    /*
     * ⚠️ DER GRUND, WARUM NACHGELESEN UND NICHT GERECHNET WIRD. „Bestand vorher
     * minus gebuchte Menge" kaeme hier auf Null, weil die uebliche Summe nur
     * die positiven Salden zaehlt — und die Angabe waere geloescht, obwohl am
     * Ort noch vier Stueck einer anderen Charge liegen.
     */
    t.db.insert(chargen).values({
      id: "ch-2", artikelId: "a1", chargenNr: "L-2", verfall: "2030-06", createdAt: NOW,
    }).run();
    buchen("b-1", "rtw-1", 4);
    t.db.insert(buchungen).values({
      id: "b-2", ts: NOW, typ: "korrektur", artikelId: "a1", chargeId: "ch-2",
      lagerortId: "rtw-1", menge: -3, quelleTyp: "system", quelleId: "seed",
      referenz: null, kommentar: null,
    }).run();

    verfallFolgtDemMaterial(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle().map((z) => z.lagerortId).sort()).toEqual([ENTNAHMEBOX_ID, "rtw-1"]);
  });

  it("ist ohne Meldung an der Quelle vollstaendig wirkungslos", () => {
    loescheVerfallEintrag(t.db, "rtw-1", "a1");
    buchen("b-1", "rtw-1", 0);

    verfallFolgtDemMaterial(t.db, {
      vonLagerortId: "rtw-1", nachLagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
    });

    expect(alle()).toEqual([]);
  });
});

describe("bereinigeVerfallOhneAktivesSoll — nur EINHEITEN sind soll-gebunden", () => {
  it("raeumt die Angabe einer Einheit ohne aktive Sollposition ab", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });

    bereinigeVerfallOhneAktivesSoll(t.db, "rtw-1", "a1");

    expect(alle()).toEqual([]);
  });

  it("laesst sie stehen, solange eine aktive Sollposition da ist", () => {
    t.db.insert(sollPositionen).values({
      id: "sp-1", fahrzeugId: "rtw-1", artikelId: "a1", soll: 3,
      fachLabel: "A1", entfernt: false,
    }).run();
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });

    bereinigeVerfallOhneAktivesSoll(t.db, "rtw-1", "a1");

    expect(alle()).toHaveLength(1);
  });

  it("FASST DIE ENTNAHMEBOX NICHT AN — sie hat kein Soll und soll keines haben", () => {
    /*
     * ⚠️ DIE ENTKOPPLUNG AUS DRK-377, UND SIE IST DER GRUND FUER DIESEN TEST.
     * Bis dahin galt „ohne Soll kein Verfall" fuer die ganze Tabelle; ein
     * Aufruf mit der Box-Id haette ihre Zeile klaglos geloescht — ein
     * Datenverlust, den kein Tor sieht, weil die Signatur eine beliebige
     * `lagerortId` nimmt und immer genommen hat.
     *
     * Die beiden heutigen Aufrufer erreichen nur Fahrzeuge. Genau deshalb steht
     * die Probe in der FUNKTION und nicht bei ihnen: den dritten Aufrufer
     * schreibt jemand, der diesen Satz nicht gelesen hat.
     */
    setzeVerfall(t.db, { lagerortId: ENTNAHMEBOX_ID, artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });

    bereinigeVerfallOhneAktivesSoll(t.db, ENTNAHMEBOX_ID, "a1");

    expect(alle()).toHaveLength(1);
  });
});
