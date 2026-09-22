// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  ERLEDIGT,
  OFFEN,
  SERVER_STAND,
  abonniereRueckmeldung,
  liesRueckmeldungStand,
  merkeRueckmeldungErledigt,
  vergissRueckmeldungStand,
} from "@/core/rueckmeldung/zustand";

/**
 * DER WINZIGE SPEICHER HINTER DEM SCHWEBENDEN KNOPF. Was hier geprüft wird, ist
 * nicht „schreibt es in `localStorage`" — das täte jede Zeile —, sondern die
 * drei Eigenschaften, an denen der Knopf hängt:
 *
 * 1. Er kommt nach einem Klick NICHT wieder (über Seitenwechsel hinweg).
 * 2. Er überlebt einen kaputten Speicher, statt die Seite mitzureißen.
 * 3. Der Schnappschuss ist `Object.is`-stabil — sonst dreht
 *    `useSyncExternalStore` in einer Endlosschleife, und zwar erst im Browser.
 */
describe("Rückmeldungs-Stand", () => {
  beforeEach(() => {
    vergissRueckmeldungStand();
    localStorage.clear();
  });

  it("ist ohne gespeicherten Stand offen — der Knopf steht da", () => {
    expect(liesRueckmeldungStand()).toBe(OFFEN);
  });

  it("bleibt nach einem Klick erledigt, auch über einen neuen Prozess hinweg", () => {
    merkeRueckmeldungErledigt();
    expect(liesRueckmeldungStand()).toBe(ERLEDIGT);
    // `vergissRueckmeldungStand()` wirft den Zwischenspeicher weg — das ist der
    // Zustand nach einem harten Seitenwechsel. Der Stand muss trotzdem halten,
    // sonst käme der Knopf auf der nächsten Seite wieder.
    vergissRueckmeldungStand();
    expect(liesRueckmeldungStand()).toBe(ERLEDIGT);
  });

  /**
   * ⚠️ EIN UNBEKANNTER WERT GILT ALS OFFEN, NICHT ALS ERLEDIGT. Ein von Hand
   * verbogener oder von einer künftigen Fassung geschriebener Eintrag darf den
   * Weg zur Rückmeldung nicht dauerhaft wegnehmen — ein Knopf zu viel ist
   * billiger als ein Weg, den niemand mehr findet.
   */
  it("hält einen unbekannten gespeicherten Wert für offen", () => {
    localStorage.setItem("iuk-rueckmeldung", "vielleicht");
    expect(liesRueckmeldungStand()).toBe(OFFEN);
  });

  /**
   * ⚠️ `localStorage` KANN WERFEN — im privaten Fenster, bei gesperrten
   * Website-Daten, in einer Vorschau. Ohne `try`/`catch` risse der Wurf die
   * ganze Arbeitsfläche mit, und zwar genau bei den Leuten, die ihre
   * Browsereinstellungen angefasst haben.
   */
  it("überlebt einen Speicher, der wirft — lesend wie schreibend", () => {
    const kaputt = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    vi.spyOn(globalThis, "localStorage", "get").mockReturnValue(
      kaputt as unknown as Storage,
    );
    try {
      expect(liesRueckmeldungStand()).toBe(OFFEN);
      expect(() => merkeRueckmeldungErledigt()).not.toThrow();
      // Für DIESE Sitzung hält der Stand trotzdem — im Zwischenspeicher. Der
      // Knopf verschwindet also auch dann sofort, wenn er nach dem Neuladen
      // wiederkommt.
      expect(liesRueckmeldungStand()).toBe(ERLEDIGT);
    } finally {
      vi.restoreAllMocks();
    }
  });

  /**
   * ⚠️ OHNE DIE EIGENE BENACHRICHTIGUNG BLIEBE DER KNOPF NACH DEM EIGENEN KLICK
   * STEHEN. Das `storage`-Ereignis feuert laut HTML-Standard nur in den ANDEREN
   * Tabs, nicht im schreibenden — der Tab, in dem jemand gerade geklickt hat,
   * erführe von seinem eigenen Klick als letzter.
   */
  it("meldet die Änderung an die Abonnenten des eigenen Tabs", () => {
    const gehoert = vi.fn();
    const abmelden = abonniereRueckmeldung(gehoert);
    try {
      merkeRueckmeldungErledigt();
      expect(gehoert).toHaveBeenCalledOnce();
      // Zweimal dasselbe ist keine Änderung: ein zweiter Ruf renderte ohne Grund.
      merkeRueckmeldungErledigt();
      expect(gehoert).toHaveBeenCalledOnce();
    } finally {
      abmelden();
    }
  });

  it("nimmt den Stand aus einem anderen Tab an", () => {
    const gehoert = vi.fn();
    const abmelden = abonniereRueckmeldung(gehoert);
    try {
      expect(liesRueckmeldungStand()).toBe(OFFEN);
      localStorage.setItem("iuk-rueckmeldung", ERLEDIGT);
      globalThis.dispatchEvent(new StorageEvent("storage", { key: "iuk-rueckmeldung" }));
      expect(gehoert).toHaveBeenCalledOnce();
      // Der Zwischenspeicher MUSS dabei geleert worden sein, sonst läse der
      // Knopf weiter den alten Stand und bliebe in diesem Tab stehen.
      expect(liesRueckmeldungStand()).toBe(ERLEDIGT);
    } finally {
      abmelden();
    }
  });

  it("meldet sich beim Abbestellen wirklich ab", () => {
    const gehoert = vi.fn();
    abonniereRueckmeldung(gehoert)();
    merkeRueckmeldungErledigt();
    expect(gehoert).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ DER SERVER RÄT NICHT, ER SAGT „ERLEDIGT". Stünde hier `OFFEN`, käme der
   * Knopf ins Server-HTML — und bei jedem, der ihn längst weggeklickt hat,
   * verschwände er nach der Hydration wieder. Ein Knopf, der aufblitzt und
   * geht, ist schlimmer als keiner, und **kein Tor sähe das**: `typecheck` und
   * `build` bleiben grün, und in jsdom gibt es keine Server-Hydration.
   */
  it("gibt dem Server den Schnappschuss ERLEDIGT", () => {
    expect(SERVER_STAND).toBe(ERLEDIGT);
  });

  /**
   * ⚠️ `Object.is`-STABIL, UND DAS IST KEINE FORMALIE. `useSyncExternalStore`
   * vergleicht Schnappschüsse mit `Object.is`; ein je Aufruf frisch gebautes
   * Objekt ergäbe eine Endlosschleife aus Rendern und Neulesen — im Browser,
   * nicht hier. Zeichenketten sind der Grund, warum dieser Speicher überhaupt
   * Zeichenketten führt und keine Booleans in einem Objekt.
   */
  it("liefert bei gleichem Stand denselben Wert (Object.is)", () => {
    expect(Object.is(liesRueckmeldungStand(), liesRueckmeldungStand())).toBe(true);
    merkeRueckmeldungErledigt();
    expect(Object.is(liesRueckmeldungStand(), liesRueckmeldungStand())).toBe(true);
  });
});
