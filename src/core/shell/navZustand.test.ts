// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KEINE_ZUGEKLAPPT,
  abonniereZugeklappt,
  entpacke,
  liesZugeklappt,
  schreibeZugeklappt,
  vergissZugeklappt,
} from "@/core/shell/navZustand";

afterEach(() => {
  vergissZugeklappt();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("navZustand", () => {
  it("merkt sich zugeklappte Abschnitte je Modul getrennt", () => {
    schreibeZugeklappt("lagerbuch", ["Bestand"]);
    schreibeZugeklappt("radio", ["Geräte"]);
    expect(entpacke(liesZugeklappt("lagerbuch"))).toEqual(["Bestand"]);
    expect(entpacke(liesZugeklappt("radio"))).toEqual(["Geräte"]);
  });

  it("liefert ohne gespeicherten Stand `nichts zugeklappt`", () => {
    expect(liesZugeklappt("lagerbuch")).toBe(KEINE_ZUGEKLAPPT);
    expect(entpacke(liesZugeklappt("lagerbuch"))).toEqual([]);
  });

  /*
   * ⚠️ DIE ZEICHENKETTE IST DER SCHNAPPSCHUSS, NICHT DIE MENGE, und dieser Fall
   * ist der Grund: `useSyncExternalStore` vergleicht mit `Object.is`. Zwei
   * gleiche `Set` sind darunter verschieden — die Navigation renderte dann bei
   * JEDEM Render neu und React bräche mit „getSnapshot should be cached" ab.
   * Zwei gleiche Zeichenketten sind gleich.
   */
  it("gibt für denselben Stand denselben Schnappschuss zurück", () => {
    schreibeZugeklappt("lagerbuch", ["Prüfungen", "Bestand"]);
    const eins = liesZugeklappt("lagerbuch");
    const zwei = liesZugeklappt("lagerbuch");
    expect(Object.is(eins, zwei)).toBe(true);
    // Sortiert geschrieben — sonst ergäbe dieselbe Menge in anderer Reihenfolge
    // einen anderen Text und damit einen Scheinwechsel.
    expect(eins).toBe(JSON.stringify(["Bestand", "Prüfungen"]));
  });

  /*
   * DIE EIGENE BENACHRICHTIGUNG — und sie ist kein Beiwerk: `storage` feuert im
   * SCHREIBENDEN Tab NICHT (HTML Standard). Ohne diese Schleife sähe die zweite
   * Fassung der Navigation (Drawer bzw. Seitenleiste — es sind immer beide im
   * Baum) eine Änderung der anderen nie.
   */
  it("benachrichtigt Hörer beim Schreiben im selben Tab", () => {
    const gehoert = vi.fn();
    const ab = abonniereZugeklappt(gehoert);
    schreibeZugeklappt("lagerbuch", ["Bestand"]);
    expect(gehoert).toHaveBeenCalledTimes(1);
    ab();
    schreibeZugeklappt("lagerbuch", ["Bestand", "Protokoll"]);
    expect(gehoert).toHaveBeenCalledTimes(1);
  });

  it("schweigt, wenn sich nichts geändert hat", () => {
    schreibeZugeklappt("lagerbuch", ["Bestand"]);
    const gehoert = vi.fn();
    abonniereZugeklappt(gehoert);
    schreibeZugeklappt("lagerbuch", ["Bestand"]);
    expect(gehoert).not.toHaveBeenCalled();
  });

  /*
   * DER SPEICHER KANN WERFEN — privates Fenster, gesperrte Website-Daten,
   * Vorschau. Der Ausfall muss harmlos sein: alle Abschnitte offen, also genau
   * das Bild von vor dieser Änderung. Eine Navigation, die an einer
   * Speichereinstellung ausfällt, wäre der teuerste denkbare Preis für eine
   * Bequemlichkeit.
   */
  it("überlebt einen werfenden localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => schreibeZugeklappt("lagerbuch", ["Bestand"])).not.toThrow();
    vergissZugeklappt();
    expect(liesZugeklappt("lagerbuch")).toBe(KEINE_ZUGEKLAPPT);
  });

  it("wirft nicht an verbogenem Speicherinhalt", () => {
    localStorage.setItem("iuk-nav-zu:lagerbuch", "{kaputt");
    expect(entpacke(liesZugeklappt("lagerbuch"))).toEqual([]);
    localStorage.setItem("iuk-nav-zu:lagerbuch", '["Bestand", 7, null]');
    vergissZugeklappt();
    expect(entpacke(liesZugeklappt("lagerbuch"))).toEqual(["Bestand"]);
  });
});
