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
   * ⚠️ NUR `ort:<kennung>` WAEHLT EINEN ORT — ein harter Schnitt, und die erste
   * Fassung dieses Tickets war weicher (P1-Befund von Codex zum PR). Sie las
   * einen Wert ohne Praefix weiter als rohe Kennung, damit alte Lesezeichen
   * gelten. Das ging fuer eine Kennung, die selbst mit `ort:` beginnt, schief:
   * beide Deutungen liefen auseinander, und das ist derselbe Fehler wie der des
   * Tickets, nur eine Ebene hoeher. Der Fall darunter haelt ihn fest.
   */
  it("waehlt ohne Praefix keinen Ort, sondern die Vorgabe", () => {
    expect(zaehlOrtAus("schrank-1")).toBeNull();
    expect(zaehlOrtAus(HANDLAGER_ID)).toBeNull();
  });

  /**
   * ⚠️ DER BEFUND, DER DEN WEICHEN WEG GEKIPPT HAT. Mit Altform-Lesen meinte
   * `?ort=ort:alle` zwei verschiedene Orte auf einmal: den Schrank `ort:alle`
   * (so stand es in einem alten Lesezeichen) und den Schrank `alle` (so liest
   * es die neue Form). Gibt es beide, zaehlte die Seite gegen den falschen
   * Bestand — und buchte die Korrektur dorthin. Jetzt gibt es nur die eine
   * Deutung: der Wert `ort:<x>` meint IMMER den Ort `<x>`.
   */
  it("deutet einen Wert mit Praefix nur auf eine Weise", () => {
    expect(zaehlOrtAus("ort:alle")).toBe(ZAEHLORT_ALLE);
    expect(zaehlOrtAus(zaehlOrtWert("ort:alle"))).toBe("ort:alle");
  });

  /**
   * ⚠️ EIN PRAEFIX OHNE KENNUNG IST KEINE WAHL. `?zaehlort=ort:` entstuende beim
   * Zusammenbauen von Hand; als Kennung `""` ginge er bis in `zaehlBereich`
   * und faende dort nichts — die Vorgabe gleich hier ist derselbe Ausgang,
   * einen Lesepfad frueher.
   */
  it("nimmt ein leeres Praefix als Vorgabe", () => {
    expect(zaehlOrtAus("ort:")).toBeNull();
    expect(zaehlOrtAus("ort:   ")).toBeNull();
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
   * `SearchParams` ist `string | string[] | undefined`; `?zaehlort=a&zaehlort=b` liefert
   * ein Array, und ein `.trim()` darauf warf — HTTP 500 fuer die ganze Seite.
   * ⚠️ WEDER `typecheck` NOCH `build` SEHEN DAS: eine engere Signatur an der
   * Seite ist eine Behauptung ueber die Laufzeit, keine Zusicherung. Nur ein
   * echter Abruf mit doppeltem Parameter — oder dieser Test.
   */
  it("wirft bei einem wiederholten Parameter nicht", () => {
    expect(() => zaehlOrtAus(["ort:schrank-1", "ort:schrank-2"])).not.toThrow();
  });

  it("nimmt denselben Ort mehrfach als Wahl, zwei verschiedene als Widerspruch", () => {
    // Dieselbe Angabe zweimal ist eine Angabe.
    expect(zaehlOrtAus(["ort:schrank-1", " ort:schrank-1 "])).toBe("schrank-1");
    // Zwei verschiedene sind keine Wahl: den ersten zu nehmen hiesse, sich
    // still fuer eine von zwei Anweisungen zu entscheiden.
    expect(zaehlOrtAus(["ort:schrank-1", "ort:schrank-2"])).toBeNull();
    // Die Vorgabe zaehlt dabei nicht mit — sie IST der Rueckfall.
    expect(zaehlOrtAus([ZAEHLORT_ALLE, "ort:schrank-1"])).toBe("schrank-1");
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
      { schluessel: ZAEHLORT_ALLE, label: "Ganzer Handlager" },
      { schluessel: HANDLAGER_ID, label: "Nicht zugeordnet" },
      { schluessel: "schrank-1", label: "Schrank 1" },
    ];
    expect(eindeutigeLabels(orte)).toEqual(orte);
  });

  /**
   * ⚠️ NUR DIE BETROFFENEN ZEILEN BEKOMMEN DIE KENNUNG. Sie an jede zu haengen
   * machte die haeufige Lage haesslich, um die seltene zu heilen.
   */
  it("haengt nur an doppelte Beschriftungen die Kennung", () => {
    expect(eindeutigeLabels([
      { schluessel: ZAEHLORT_ALLE, label: "Ganzer Handlager" },
      { schluessel: "schrank-a", label: "Schrank 1" },
      { schluessel: "schrank-b", label: "Schrank 1" },
      { schluessel: "schrank-c", label: "GF-Schrank" },
    ])).toEqual([
      { schluessel: ZAEHLORT_ALLE, label: "Ganzer Handlager" },
      { schluessel: "schrank-a", label: "Schrank 1 (schrank-a)" },
      { schluessel: "schrank-b", label: "Schrank 1 (schrank-b)" },
      { schluessel: "schrank-c", label: "GF-Schrank" },
    ]);
  });

  /**
   * ⚠️ DIE RICHTUNG, AN DIE DER BEFUND NICHT GEDACHT HAT: ein Schrank, den
   * jemand „Nicht zugeordnet" nennt, kollidiert mit der Wurzel. Dieselbe
   * Verwechslung, nur nicht zwischen zwei Schraenken.
   */
  it("schuetzt auch die Wurzel vor einem gleichnamigen Schrank", () => {
    const [wurzel, schrank] = eindeutigeLabels([
      { schluessel: HANDLAGER_ID, label: "Nicht zugeordnet" },
      { schluessel: "schrank-frech", label: "Nicht zugeordnet" },
    ]);
    expect(wurzel!.label).toBe(`Nicht zugeordnet (${HANDLAGER_ID})`);
    expect(schrank!.label).toBe("Nicht zugeordnet (schrank-frech)");
  });

  /**
   * ⚠️ DER ZWEITE P1-BEFUND VON CODEX ZU DRK-371, UND ER TRIFFT GENAU DIE
   * SCHWACHSTELLE DIESER FUNKTION: sie unterscheidet ueber einen Wert, den der
   * Aufrufer liefert — taugt der nicht, ist der Beweis wertlos.
   *
   * Kurzzeitig war das `id ?? "alle"`. Ein importierter Schrank mit der Kennung
   * `alle`, der auch noch „Ganzer Handlager" heisst, ergab damit ZWEIMAL
   * „Ganzer Handlager (alle)" — zwei optisch gleiche Zeilen fuer zwei ganz
   * verschiedene Zaehlumfaenge, und wer danebengreift, bucht die Korrektur in
   * den falschen. Also derselbe Fehler wie der des Tickets, nur eine Ebene
   * weiter: nicht mehr im Wert, sondern in der Beschriftung daneben.
   *
   * Mit dem Auswahlwert als Unterscheider faellt er weg — `alle` gegen
   * `ort:alle`. Das ist die Form, in der die Inventurseite aufruft.
   */
  it("haelt den Waechter von einem gleichnamigen Schrank mit der Kennung „alle“ auseinander", () => {
    const [waechter, schrank] = eindeutigeLabels([
      { schluessel: zaehlOrtWert(null), label: "Ganzer Handlager" },
      { schluessel: zaehlOrtWert(ZAEHLORT_ALLE), label: "Ganzer Handlager" },
    ]);
    expect(waechter!.label).toBe("Ganzer Handlager (alle)");
    expect(schrank!.label).toBe("Ganzer Handlager (ort:alle)");
    expect(waechter!.label).not.toBe(schrank!.label);
  });

  /**
   * ⚠️ DER FALL, DEN EIN DURCHGANG NICHT LOEST (zweiter Codex-Befund zu DRK-337).
   * Zwei Schraenke heissen `X`, ein dritter heisst bereits woertlich `X (a)` —
   * genau das, was der erste Durchgang fuer den ersten Schrank erzeugt. Gezaehlt
   * werden die ALTEN Beschriftungen, der dritte bleibt also unangetastet, und
   * am Ende stuenden zwei gleiche Zeilen da. Dieselbe Fehlbedienung wie vorher,
   * nur eine Stufe tiefer.
   */
  it("bleibt eindeutig, wenn eine erzeugte Beschriftung schon vergeben ist", () => {
    const ergebnis = eindeutigeLabels([
      { schluessel: "a", label: "X" },
      { schluessel: "b", label: "X" },
      { schluessel: "c", label: "X (a)" },
    ]);
    expect(new Set(ergebnis.map((o) => o.label)).size).toBe(3);
  });

  /**
   * ⚠️ DER P2-BEFUND VON CODEX ZU DRK-371, nachgerechnet und bestaetigt — und
   * er trifft den BEWEIS, nicht nur einen Fall. Die Verkettung
   * `Name (Kennung)` bildet das PAAR nicht eindeutig ab, weil Name und Kennung
   * beide beliebige Zeichenketten sind:
   *
   *   Name `X`     + Kennung `p) (q`  →  `X (p) (q)`
   *   Name `X (p)` + Kennung `q`      →  `X (p) (q)`
   *
   * ⚠️ DIE BEIDEN ZEILEN ALLEIN REICHEN NICHT, und das ist der Grund, warum die
   * Beispiele des Befunds sich auflosten: ihre Ausgangsnamen sind verschieden,
   * also fasst der erste Durchgang sie gar nicht an. Erreichbar wird die
   * Kollision erst im Rueckfall — den erzwingen hier die drei `Y`-Zeilen, bei
   * denen eine ERZEUGTE Beschriftung eine unangetastete trifft.
   */
  it("bleibt eindeutig, wenn die Verkettung selbst zweideutig wird", () => {
    const orte = [
      { schluessel: "s1", label: "Y" },
      { schluessel: "s2", label: "Y" },
      { schluessel: "s3", label: "Y (s1)" },
      { schluessel: "p) (q", label: "X" },
      { schluessel: "q", label: "X (p)" },
    ];
    const ergebnis = eindeutigeLabels(orte);
    expect(new Set(ergebnis.map((o) => o.label)).size).toBe(orte.length);
  });

  /**
   * Die Zusicherung, die fuer JEDE Eingabe gilt, nicht nur fuer die bedachten:
   * gleiche Unterscheider gibt es nicht, also kann das Ergebnis keine zwei
   * gleichen Beschriftungen tragen. Geprueft an einer Sammlung boesartiger
   * Faelle — darunter die Auswahl der Inventurseite mit dem Waechter neben
   * einem Schrank namens `alle`, und die zweideutige Verkettung von oben.
   */
  it.each([
    [[{ schluessel: "a", label: "X" }, { schluessel: "b", label: "X" }, { schluessel: "c", label: "X (a)" }]],
    [[{ schluessel: "a", label: "X" }, { schluessel: "b", label: "X" }, { schluessel: "c", label: "X (a)" }, { schluessel: "d", label: "X (b)" }]],
    [[{ schluessel: "a", label: "X (b)" }, { schluessel: "b", label: "X (a)" }]],
    [[{ schluessel: "a", label: "" }, { schluessel: "b", label: "" }]],
    [[{ schluessel: "a", label: "X" }, { schluessel: "b", label: "X" }, { schluessel: "c", label: "X" }]],
    [[
      { schluessel: zaehlOrtWert(null), label: "Ganzer Handlager" },
      { schluessel: zaehlOrtWert(ZAEHLORT_ALLE), label: "Ganzer Handlager" },
      { schluessel: zaehlOrtWert("x"), label: "Ganzer Handlager (alle)" },
    ]],
    [[
      { schluessel: "s1", label: "Y" },
      { schluessel: "s2", label: "Y" },
      { schluessel: "s3", label: "Y (s1)" },
      { schluessel: "p) (q", label: "X" },
      { schluessel: "q", label: "X (p)" },
    ]],
    [[
      { schluessel: "a", label: "X" },
      { schluessel: "b", label: "X" },
      { schluessel: "c", label: "X (a)" },
      { schluessel: ") (", label: "" },
      { schluessel: "", label: " ()" },
    ]],
  ])("liefert fuer %# durchweg verschiedene Beschriftungen", (orte) => {
    const ergebnis = eindeutigeLabels(orte);
    expect(new Set(ergebnis.map((o) => o.label)).size).toBe(orte.length);
    // Die Unterscheider bleiben dabei unangetastet — an ihnen haengt die Wahl.
    expect(ergebnis.map((o) => o.schluessel)).toEqual(orte.map((o) => o.schluessel));
  });

  it("liefert eine neue Liste, ohne die uebergebene anzufassen", () => {
    const orte = [{ schluessel: "a", label: "X" }, { schluessel: "b", label: "X" }];
    const ergebnis = eindeutigeLabels(orte);
    expect(orte.map((o) => o.label)).toEqual(["X", "X"]);
    expect(ergebnis.map((o) => o.label)).toEqual(["X (a)", "X (b)"]);
  });
});
