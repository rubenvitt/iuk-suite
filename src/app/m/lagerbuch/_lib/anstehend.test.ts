import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { checks, geraete, lagerorte, maengel, o2Flaschen, o2Messungen } from "../_db/schema";
import { verwaltungInhalt } from "../verwaltung/(arbeit)/page";
import { anstehend, CHECK_BEFUND_TAGE } from "./anstehend";

const JETZT = new Date("2026-11-10T10:00:00Z");
const TAG = 86_400_000;
let t: TestDb;

function befundCheck(id: string, completedAt: Date | null, mitBefund: boolean) {
  const ergebnis = {
    positionen: [], artikel: [], flaschen: [], verfall: [],
    geraete: mitBefund ? [{ geraetId: "g-alt", vorhanden: false, zustand: "In Ordnung", bemerkung: "fehlt" }] : [],
  };
  t.db.insert(checks).values({
    id, fahrzeugId: "rtw1", quelleTyp: "token", quelleId: "111-111",
    startedAt: completedAt ?? JETZT, completedAt, ergebnis: completedAt ? JSON.stringify(ergebnis) : null,
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-anstehend-");
  t.db.insert(lagerorte).values({ id: "rtw1", name: "RTW 1", typ: "fahrzeug", einheitenart: "fahrzeug" }).run();
  t.db.insert(maengel).values([
    { id: "m1", lagerortId: "rtw1", punkte: ["Blaulicht defekt"], quelleTyp: "token", quelleId: "x", createdAt: JETZT },
    { id: "m2", lagerortId: "rtw1", punkte: [], quelleTyp: "token", quelleId: "x", createdAt: JETZT, erledigtAt: JETZT },
  ]).run();
  t.db.insert(geraete).values([
    { id: "g-ueber", typ: "medizin", name: "Defibrillator", lagerortId: "rtw1", mtkFaellig: "2026-11-01", createdAt: JETZT },
    { id: "g-bald", typ: "medizin", name: "Absaugpumpe", lagerortId: "rtw1", mtkFaellig: "2026-11-20", createdAt: JETZT },
    { id: "g-gut", typ: "medizin", name: "Pulsoxymeter", lagerortId: "rtw1", mtkFaellig: "2027-11-20", createdAt: JETZT },
    { id: "g-ohne", typ: "medizin", name: "Blutdruckmessgerät", lagerortId: "rtw1", createdAt: JETZT },
    { id: "g-aus", typ: "medizin", name: "Altgerät", lagerortId: "rtw1", mtkFaellig: "2020-01-01", aktiv: false, createdAt: JETZT },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "f-leer", name: "O2 A", lagerortId: "rtw1", createdAt: JETZT },
    { id: "f-voll", name: "O2 B", lagerortId: "rtw1", createdAt: JETZT },
    { id: "f-ohne", name: "O2 C", lagerortId: "rtw1", createdAt: JETZT },
  ]).run();
  t.db.insert(o2Messungen).values([
    { id: "o1", flascheId: "f-leer", ts: JETZT, druckBar: 20, quelleTyp: "oidc", quelleId: "u" },
    { id: "o2", flascheId: "f-voll", ts: JETZT, druckBar: 190, quelleTyp: "oidc", quelleId: "u" },
  ]).run();
  befundCheck("c-neu", new Date(JETZT.getTime() - TAG), true);
  befundCheck("c-ohne", new Date(JETZT.getTime() - TAG), false);
  befundCheck("c-alt", new Date(JETZT.getTime() - (CHECK_BEFUND_TAGE + 2) * TAG), true);
  befundCheck("c-laeuft", null, false);
});

afterEach(() => t.schliessen());

describe("anstehend", () => {
  it("zählt mit den Bedingungen der Zielseiten", () => {
    const a = anstehend(t.db, JETZT);
    expect({
      maengel: a.maengel,
      geraeteUeberfaellig: a.geraeteUeberfaellig,
      geraeteBald: a.geraeteBald,
      flaschenWechseln: a.flaschenWechseln,
      checksMitBefund: a.checksMitBefund,
    }).toEqual({ maengel: 1, geraeteUeberfaellig: 1, geraeteBald: 1, flaschenWechseln: 1, checksMitBefund: 1 });
  });

  it("listet Dringendes zuerst, jede Zeile mit Ort, Zustand und Ziel", () => {
    const { zeilen } = anstehend(t.db, JETZT);
    expect(zeilen.map((z) => [z.art, z.titel, z.ton, z.href])).toEqual([
      ["Mangel", "Blaulicht defekt", "rot", "/verwaltung/maengel"],
      ["Gerät", "Defibrillator", "rot", "/verwaltung/geraete/g-ueber"],
      ["Sauerstoff", "Flasche O2 A", "rot", "/verwaltung/sauerstoff/f-leer"],
      ["Gerät", "Absaugpumpe", "gelb", "/verwaltung/geraete/g-bald"],
    ]);
    expect(zeilen[0].wo).toBe("RTW 1");
    expect(zeilen[1].zustand).toMatch(/^MTK überfällig/);
  });

  it("geht als reines JSON über die RSC-Grenze", () => {
    const a = anstehend(t.db, JETZT);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

/** Alle Elemente eines Baums, Funktionskomponenten werden aufgerufen (Server-Render ohne DOM). */
function alle(wert: ReactNode): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap(alle);
  if (!isValidElement(wert)) return [];
  const props = wert.props as { children?: ReactNode };
  if (typeof wert.type === "function" && wert.type.name === "FristZeile") {
    return [wert, ...alle((wert.type as (p: unknown) => ReactNode)(wert.props))];
  }
  return [wert, ...alle(props.children)];
}

describe("Verwaltungsübersicht — „Was steht an“ (IDA-380)", () => {
  it("zeigt offene Mängel und überfällige Geräte ohne Klick, jeweils mit Link", () => {
    const seite = verwaltungInhalt(t.db, JETZT);
    const fristen = alle(seite).filter((e) => (e.props as { "data-art"?: string })["data-art"]);
    expect(fristen.map((e) => (e.props as { "data-art": string })["data-art"]))
      .toEqual(["Mangel", "Gerät", "Sauerstoff", "Gerät"]);
    const ziele = alle(seite)
      .map((e) => (e.props as { href?: unknown }).href)
      .filter((h): h is string => typeof h === "string");
    expect(ziele).toContain("/verwaltung/maengel");
    expect(ziele).toContain("/verwaltung/geraete/g-ueber");
  });

  it("die Karte heißt „Was steht an“ (Wortliste)", () => {
    const seite = verwaltungInhalt(t.db, JETZT);
    const titel = alle(seite).map((e) => (e.props as { title?: unknown }).title).filter((x) => typeof x === "string");
    expect(titel).toContain("Was steht an");
    expect(titel).not.toContain("Kritische Artikel");
  });
});
