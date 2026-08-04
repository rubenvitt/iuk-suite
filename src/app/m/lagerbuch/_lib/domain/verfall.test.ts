import { describe, it, expect } from "vitest";
import { verfallStatus, verfallSchwellen, type VerfallSchwellen } from "./verfall";
import { PSEUDO_VERFALL } from "../konstanten";
import { ZEITZONE, ausZivilzeit } from "../zeit";

/**
 * DIE SCHWELLEN STEHEN HIER ALS LITERALE, nicht aus `grenzen()` gelesen.
 *
 * Die Funktion nimmt sie als Parameter — genau deshalb ist sie ohne Umgebung
 * pruefbar. Wer hier `verfallSchwellen()` einsetzte, machte aus jedem Fall eine
 * Aussage ueber die .env statt ueber die Rechnung.
 */
const S: VerfallSchwellen = { rotTage: 31, gelbTage: 56 };

/** Ein fester Bezugspunkt: 1. Januar 2026, 12:00 Ortszeit. Ueber `ausZivilzeit`
 *  gebildet, damit der Test unter JEDER Prozess-TZ dasselbe meint (§12.6, Punkt 1). */
const NOW = ausZivilzeit(2026, 1, 1, 12, 0, 0, 0);

describe("verfallStatus — das Monatsende", () => {
  it("ist der LETZTE Tag des Monats, 23:59:59.999 in ZEITZONE", () => {
    // Die Zusage wird ueber Intl gegen die ZONE zurueckgelesen, NICHT ueber
    // lokale Getter. `d.getHours()` antwortete unter TZ=UTC 21 statt 23 und der
    // Test waere unter jeder Zone gruen bzw. unter jeder anderen rot — genau die
    // Bauform, die `lagerbuch/src/db/backup.test.ts:6-7` falsch macht.
    const s = verfallStatus("2026-08", S, NOW);
    // 2026-08 laeuft am 31.08.2026 ab; von NOW (01.01.) sind das 242 Tage.
    expect(s.ampel).toBe("gruen");
    expect(s.abgelaufen).toBe(false);
  });

  it("rechnet das Monatsende ueber _lib/zeit.ts, nicht ueber new Date(y, m, 0, …)", () => {
    // Kanten-Nachweis: der 31.08.2026, 23:59:59.999 Ortszeit liegt in Berlin bei
    // 21:59:59.999Z (Sommerzeit). Wir pruefen die Zonen-Zurueckrechnung, nicht die
    // Zahl 242.
    const ende = ausZivilzeit(2026, 8, 31, 23, 59, 59, 999);
    const f = new Intl.DateTimeFormat("de-DE", {
      timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    expect(f.format(ende)).toBe("31.08.2026, 23:59");
  });
});

describe("verfallStatus — `tage` ist AUFGERUNDET", () => {
  it("eine Charge, die in 12 Stunden ablaeuft, hat tage = 1, nicht 0", () => {
    // Math.ceil, nicht Math.round und nicht Math.floor. Eine abgerundete Zahl
    // liesse eine Charge am Ablauftag als „0 Tage" erscheinen und verschoebe
    // JEDE Ampelkante um einen Tag nach unten.
    const ende = ausZivilzeit(2026, 1, 31, 23, 59, 59, 999);
    const zwoelfStundenVorher = new Date(ende.getTime() - 12 * 3_600_000);
    const s = verfallStatus("2026-01", S, zwoelfStundenVorher);
    expect(s.tage).toBe(1);
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallStatus — die drei Schwellen an ihren KANTEN", () => {
  /** Ein `now`, aus dem sich genau `tage` bis zum Monatsende ergeben. */
  function nowFuerTage(verfall: string, tage: number): Date {
    const [y, m] = verfall.split("-").map(Number);
    const ende = ausZivilzeit(y, m + 1, 0, 23, 59, 59, 999);
    // ceil((ende - now)/86_400_000) === tage  ⇔  now liegt knapp unter der Kante.
    return new Date(ende.getTime() - (tage - 1) * 86_400_000 - 1);
  }

  it("tage === rotTage ist ROT (nicht gelb) — die Grenze ist inklusiv", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 31)).ampel).toBe("rot");
  });

  it("tage === rotTage + 1 ist GELB", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 32)).ampel).toBe("gelb");
  });

  it("tage === gelbTage ist GELB (nicht gruen) — auch diese Grenze ist inklusiv", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 56)).ampel).toBe("gelb");
  });

  it("tage === gelbTage + 1 ist GRUEN", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 57)).ampel).toBe("gruen");
  });

  it("VERTAUSCHTE Schwellen machen den Gelb-Zweig unerreichbar — die Falle aus §10.1", () => {
    /**
     * Diese Zeile ist der Grund fuer die Umbenennung (Festlegung H2, §10.1). Sie
     * beweist NICHT, dass der Code richtig ist — sie beweist, dass ein
     * vertauschtes Wertepaar KEINEN Fehler wirft und die Ampel still auf zwei
     * Zustaende zusammenfaellt. Der Riegel dagegen ist Boot-Pruefung 2 (T32),
     * nicht diese Funktion.
     */
    const vertauscht: VerfallSchwellen = { rotTage: 56, gelbTage: 31 };
    for (const tage of [1, 15, 31, 40, 56]) {
      expect(verfallStatus("2026-06", vertauscht, nowFuerTage("2026-06", tage)).ampel).toBe("rot");
    }
    expect(verfallStatus("2026-06", vertauscht, nowFuerTage("2026-06", 57)).ampel).toBe("gruen");
    // KEIN Aufruf liefert jemals "gelb". Genau das sieht kein Gate.
  });
});

describe("verfallStatus — `abgelaufen` ist NICHT dasselbe wie ampel === 'rot'", () => {
  it("eine abgelaufene Charge ist immer rot", () => {
    const s = verfallStatus("2020-01", S, NOW);
    expect(s.abgelaufen).toBe(true);
    expect(s.ampel).toBe("rot");
    expect(s.tage).toBeLessThan(0);
  });

  it("eine rote Charge ist NICHT immer abgelaufen", () => {
    // 20 Tage Restlaufzeit: rot, aber nicht abgelaufen. Die Verfallsliste
    // sortiert genau nach diesem Unterschied in drei Raengen (§5.6.1).
    const ende = ausZivilzeit(2026, 1, 31, 23, 59, 59, 999);
    const s = verfallStatus("2026-01", S, new Date(ende.getTime() - 20 * 86_400_000));
    expect(s.ampel).toBe("rot");
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallStatus — die Pseudo-Charge", () => {
  it("PSEUDO_VERFALL ist bis 2099 gruen", () => {
    // Die Verfallsliste blendet gruen aus — deshalb taucht die Pseudo-Charge dort
    // nicht auf, und genau das bleibt so (§5.3.2).
    const s = verfallStatus(PSEUDO_VERFALL, S, NOW);
    expect(s.ampel).toBe("gruen");
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallSchwellen — die EINZIGE Bruecke von grenzen() hierher", () => {
  it("bildet verfallRotTage auf rotTage ab und verfallGelbTage auf gelbTage", () => {
    // Wuerden die Felder hier vertauscht, waere die ganze Umbenennung aus §10.1
    // wirkungslos — und der Fehler saesse an EINER Stelle statt an elf. Das ist
    // der Zweck der Bruecke, und deshalb hat sie einen eigenen Fall.
    const s = verfallSchwellen({
      LAGERBUCH_VERFALL_ROT_TAGE: "10",
      LAGERBUCH_VERFALL_GELB_TAGE: "20",
    });
    expect(s).toEqual({ rotTage: 10, gelbTage: 20 });
  });

  it("liefert bei leerer Umgebung die Vorgaben 31 / 56", () => {
    expect(verfallSchwellen({})).toEqual({ rotTage: 31, gelbTage: 56 });
  });

  it("liest bei JEDEM Aufruf, nicht beim Import", () => {
    expect(verfallSchwellen({ LAGERBUCH_VERFALL_ROT_TAGE: "7" }).rotTage).toBe(7);
    expect(verfallSchwellen({ LAGERBUCH_VERFALL_ROT_TAGE: "9" }).rotTage).toBe(9);
  });
});
