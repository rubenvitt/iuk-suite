import { describe, expect, it } from "vitest";
import { HANDLAGER_ID } from "./konstanten";
import {
  eindeutigeLabels,
  ZAEHLORT_ALLE,
  zaehlOrtAus,
  zaehlOrtBeschreibung,
  zaehlOrtLabel,
  zaehlOrtWert,
} from "./inventurOrt";

/**
 * DRK-337 — der Zaehlort als reine Funktionen, ohne Datenbank und ohne Rendern.
 */
describe("zaehlOrtAus", () => {
  it("macht aus fehlender Angabe und aus der Vorgabe denselben ganzen Handlager", () => {
    expect(zaehlOrtAus(undefined)).toBeNull();
    expect(zaehlOrtAus("")).toBeNull();
    expect(zaehlOrtAus("   ")).toBeNull();
    expect(zaehlOrtAus(ZAEHLORT_ALLE)).toBeNull();
  });

  it("reicht einen Ort durch, Wurzel wie Schrank", () => {
    expect(zaehlOrtAus(zaehlOrtWert(HANDLAGER_ID))).toBe(HANDLAGER_ID);
    expect(zaehlOrtAus(` ${zaehlOrtWert("schrank-1")} `)).toBe("schrank-1");
  });

  /**
   * ⚠️ DER ALTE WERT OHNE PRAEFIX GILT WEITER (DRK-371). Er steht in
   * Lesezeichen; ihn abzuweisen hiesse, dass ein geteilter Link still den
   * ganzen Handlager zaehlt statt den Schrank, den er meint.
   */
  it("liest die Altform ohne Praefix weiter", () => {
    expect(zaehlOrtAus("schrank-1")).toBe("schrank-1");
    expect(zaehlOrtAus(HANDLAGER_ID)).toBe(HANDLAGER_ID);
  });

  /**
   * ⚠️ EIN PRAEFIX OHNE KENNUNG IST KEINE WAHL. `?ort=ort:` entstuende beim
   * Zusammenbauen von Hand; als Kennung `""` ginge er bis in `zaehlBereich`
   * und faende dort nichts — die Vorgabe gleich hier ist derselbe Ausgang,
   * einen Lesepfad frueher.
   */
  it("nimmt ein leeres Praefix als Vorgabe", () => {
    expect(zaehlOrtAus("ort:")).toBeNull();
    expect(zaehlOrtAus("ort:   ")).toBeNull();
  });

  /**
   * ⚠️ DIESELBE WAHL IN ZWEI SCHREIBWEISEN IST EINE WAHL, kein Widerspruch.
   * Entdoppelt wird deshalb NACH dem Aufloesen; davor waere `schrank-1` von
   * `ort:schrank-1` verschieden, und die Seite fiele auf den ganzen Handlager
   * zurueck — ausgerechnet fuer einen Link, der eindeutig ist.
   */
  it("haelt Altform und neue Form desselben Orts fuer denselben Ort", () => {
    expect(zaehlOrtAus(["schrank-1", "ort:schrank-1"])).toBe("schrank-1");
  });

  /**
   * ⚠️ DAS IST DER FUND DES TICKETS (DRK-371), und er haengt NICHT am
   * unwahrscheinlichen Namen: die Zusicherung lautet, dass der Waechter und
   * JEDE Lagerort-Kennung in getrennten Wertebereichen liegen. Geprueft am
   * haertesten Vertreter — ein importierter Schrank heisst woertlich wie der
   * Waechter. Kennungen des Altbestands sind beliebige Zeichenketten; keine
   * wird beim Import neu vergeben.
   */
  it.each([ZAEHLORT_ALLE, "ort:", "Alle", `${ZAEHLORT_ALLE}x`, "ort:alle"])(
    "unterscheidet den Schrank mit der Kennung %j vom ganzen Handlager",
    (kennung) => {
      const wert = zaehlOrtWert(kennung);
      expect(wert).not.toBe(ZAEHLORT_ALLE);
      expect(zaehlOrtAus(wert)).toBe(kennung);
      expect(zaehlOrtAus(ZAEHLORT_ALLE)).toBeNull();
    },
  );

  /**
   * ⚠️ DER PARAMETER KANN EIN ARRAY SEIN (Codex-Befund zum PR). Nexts
   * `SearchParams` ist `string | string[] | undefined`; `?ort=a&ort=b` liefert
   * ein Array, und ein `.trim()` darauf warf — HTTP 500 fuer die ganze Seite.
   * ⚠️ WEDER `typecheck` NOCH `build` SEHEN DAS: eine engere Signatur an der
   * Seite ist eine Behauptung ueber die Laufzeit, keine Zusicherung. Nur ein
   * echter Abruf mit doppeltem Parameter — oder dieser Test.
   */
  it("wirft bei einem wiederholten Parameter nicht", () => {
    expect(() => zaehlOrtAus(["schrank-1", "schrank-2"])).not.toThrow();
  });

  it("nimmt denselben Ort mehrfach als Wahl, zwei verschiedene als Widerspruch", () => {
    // Dieselbe Angabe zweimal ist eine Angabe.
    expect(zaehlOrtAus(["schrank-1", " schrank-1 "])).toBe("schrank-1");
    // Zwei verschiedene sind keine Wahl: den ersten zu nehmen hiesse, sich
    // still fuer eine von zwei Anweisungen zu entscheiden.
    expect(zaehlOrtAus(["schrank-1", "schrank-2"])).toBeNull();
    // Die Vorgabe zaehlt dabei nicht mit — sie IST der Rueckfall.
    expect(zaehlOrtAus([ZAEHLORT_ALLE, "schrank-1"])).toBe("schrank-1");
    expect(zaehlOrtAus([])).toBeNull();
    expect(zaehlOrtAus(["", "  "])).toBeNull();
  });
});

describe("zaehlOrtLabel", () => {
  /**
   * ⚠️ DIE WURZEL HEISST NICHT WIE IHR LAGERORT. „Handlager" stuende fuer
   * denselben Bereich wie „ganzer Handlager", und im append-only Verlauf waere
   * danach nicht mehr zu erkennen, ob jemand alles gezaehlt hat oder nur das
   * Unsortierte.
   */
  it("unterscheidet ganzen Handlager, Wurzel und Schrank", () => {
    expect(zaehlOrtLabel(null, undefined)).toBe("Ganzer Handlager");
    expect(zaehlOrtLabel(HANDLAGER_ID, "Handlager")).toBe("Nicht zugeordnet");
    expect(zaehlOrtLabel("schrank-1", "Schrank 1")).toBe("Schrank 1");
  });

  /**
   * ⚠️ „GANZER HANDLAGER" IST `null` UND SONST NICHTS (DRK-371). Bis dahin galt
   * auch die Zeichenkette `alle` dafuer — ein Schrank mit dieser Kennung hiess
   * dadurch „Ganzer Handlager", und zwar auch im append-only Verlauf, wo es
   * niemand mehr geraderuecken kann.
   */
  it("laesst dem Schrank mit der Kennung alle seinen eigenen Namen", () => {
    expect(zaehlOrtLabel(ZAEHLORT_ALLE, "Schrank A")).toBe("Schrank A");
    expect(zaehlOrtLabel(ZAEHLORT_ALLE, undefined)).toBe(ZAEHLORT_ALLE);
  });

  /** Ohne Namen die Kennung: eine leere Beschriftung waere schlimmer als eine rohe. */
  it("faellt ohne Namen auf die Kennung zurueck", () => {
    expect(zaehlOrtLabel("schrank-1", undefined)).toBe("schrank-1");
  });
});

describe("zaehlOrtBeschreibung", () => {
  it("nennt je Fall, was gezaehlt wird", () => {
    expect(zaehlOrtBeschreibung(null, undefined)).toContain("gesamten Handlager");
    expect(zaehlOrtBeschreibung(HANDLAGER_ID, undefined)).toContain("noch keinem Schrank zugeordnet");
    expect(zaehlOrtBeschreibung("schrank-1", "Schrank 1")).toContain("in Schrank 1");
  });
});

/**
 * DRK-337, P1-Befund von Codex zum PR: zwei Schraenke duerfen heute gleich
 * heissen (kein Index, keine Pruefung in `createSchrank` — nachgesehen).
 */
describe("eindeutigeLabels", () => {
  it("laesst eine Liste ohne Dopplung unveraendert", () => {
    const orte = [
      { id: null, label: "Ganzer Handlager" },
      { id: HANDLAGER_ID, label: "Nicht zugeordnet" },
      { id: "schrank-1", label: "Schrank 1" },
    ];
    expect(eindeutigeLabels(orte)).toEqual(orte);
  });

  /**
   * ⚠️ NUR DIE BETROFFENEN ZEILEN BEKOMMEN DIE KENNUNG. Sie an jede zu haengen
   * machte die haeufige Lage haesslich, um die seltene zu heilen.
   */
  it("haengt nur an doppelte Beschriftungen die Kennung", () => {
    expect(eindeutigeLabels([
      { id: null, label: "Ganzer Handlager" },
      { id: "schrank-a", label: "Schrank 1" },
      { id: "schrank-b", label: "Schrank 1" },
      { id: "schrank-c", label: "GF-Schrank" },
    ])).toEqual([
      { id: null, label: "Ganzer Handlager" },
      { id: "schrank-a", label: "Schrank 1 (schrank-a)" },
      { id: "schrank-b", label: "Schrank 1 (schrank-b)" },
      { id: "schrank-c", label: "GF-Schrank" },
    ]);
  });

  /**
   * ⚠️ DIE RICHTUNG, AN DIE DER BEFUND NICHT GEDACHT HAT: ein Schrank, den
   * jemand „Nicht zugeordnet" nennt, kollidiert mit der Wurzel. Dieselbe
   * Verwechslung, nur nicht zwischen zwei Schraenken.
   */
  it("schuetzt auch die Wurzel vor einem gleichnamigen Schrank", () => {
    const [wurzel, schrank] = eindeutigeLabels([
      { id: HANDLAGER_ID, label: "Nicht zugeordnet" },
      { id: "schrank-frech", label: "Nicht zugeordnet" },
    ]);
    expect(wurzel!.label).toBe(`Nicht zugeordnet (${HANDLAGER_ID})`);
    expect(schrank!.label).toBe("Nicht zugeordnet (schrank-frech)");
  });

  /**
   * ⚠️ DER FALL, DEN EIN DURCHGANG NICHT LOEST (zweiter Codex-Befund).
   * Zwei Schraenke heissen `X`, ein dritter heisst bereits woertlich `X (a)` —
   * genau das, was der erste Durchgang fuer den ersten Schrank erzeugt. Gezaehlt
   * werden die ALTEN Beschriftungen, der dritte bleibt also unangetastet, und
   * am Ende stuenden zwei gleiche Zeilen da. Dieselbe Fehlbedienung wie vorher,
   * nur eine Stufe tiefer.
   */
  it("bleibt eindeutig, wenn eine erzeugte Beschriftung schon vergeben ist", () => {
    const ergebnis = eindeutigeLabels([
      { id: "a", label: "X" },
      { id: "b", label: "X" },
      { id: "c", label: "X (a)" },
    ]);
    expect(new Set(ergebnis.map((o) => o.label)).size).toBe(3);
  });

  /**
   * Die Zusicherung, die fuer JEDE Eingabe gilt, nicht nur fuer die bedachten:
   * gleiche Kennungen gibt es nicht, also kann das Ergebnis keine zwei gleichen
   * Beschriftungen tragen. Geprueft an einer Sammlung boesartiger Faelle.
   */
  it.each([
    [[{ id: "a", label: "X" }, { id: "b", label: "X" }, { id: "c", label: "X (a)" }]],
    [[{ id: "a", label: "X" }, { id: "b", label: "X" }, { id: "c", label: "X (a)" }, { id: "d", label: "X (b)" }]],
    [[{ id: "a", label: "X (b)" }, { id: "b", label: "X (a)" }]],
    [[{ id: "a", label: "" }, { id: "b", label: "" }]],
    [[{ id: "a", label: "X" }, { id: "b", label: "X" }, { id: "c", label: "X" }]],
  ])("liefert fuer %# durchweg verschiedene Beschriftungen", (orte) => {
    const ergebnis = eindeutigeLabels(orte);
    expect(new Set(ergebnis.map((o) => o.label)).size).toBe(orte.length);
    // Die Kennungen bleiben dabei unangetastet — sie sind der Wert, der gebucht wird.
    expect(ergebnis.map((o) => o.id)).toEqual(orte.map((o) => o.id));
  });

  it("liefert eine neue Liste, ohne die uebergebene anzufassen", () => {
    const orte = [{ id: "a", label: "X" }, { id: "b", label: "X" }];
    const ergebnis = eindeutigeLabels(orte);
    expect(orte.map((o) => o.label)).toEqual(["X", "X"]);
    expect(ergebnis.map((o) => o.label)).toEqual(["X (a)", "X (b)"]);
  });
});
