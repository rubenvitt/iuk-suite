import { describe, it, expect } from "vitest";
import { fefoVerteilung, type ChargeRest } from "./fefo";

const T0 = new Date("2026-01-01T00:00:00Z");
const tage = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe("fefoVerteilung — aufsteigender Verfall", () => {
  it("raeumt die frueher ablaufende Charge zuerst ab", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "spaet", verfall: "2027-06", rest: 10, createdAt: T0 },
      { chargeId: "frueh", verfall: "2026-03", rest: 4, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 6)).toEqual([
      { chargeId: "frueh", menge: 4 },
      { chargeId: "spaet", menge: 2 },
    ]);
  });

  it("sortiert nach verfall, AUCH WENN die chargeId alphabetisch das Gegenteil nahelegt", () => {
    /**
     * ISOLIERT DIE ERSTSTUFE. Im Test oben ist "frueh" < "spaet" auch alphabetisch
     * — eine Implementierung, die verfall komplett ignoriert und nur nach
     * chargeId sortiert, bestuende ihn trotzdem. Hier liegt die alphabetisch
     * FRUEHERE chargeId ("aaa") auf dem SPAETEREN Verfall, und umgekehrt: nur
     * eine echte verfall-Sortierung besteht diesen Test.
     */
    const chargen: ChargeRest[] = [
      { chargeId: "zzz", verfall: "2026-03", rest: 4, createdAt: T0 },
      { chargeId: "aaa", verfall: "2027-06", rest: 10, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 6)).toEqual([
      { chargeId: "zzz", menge: 4 },
      { chargeId: "aaa", menge: 2 },
    ]);
  });

  it("ueberspringt Chargen mit rest <= 0", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "leer", verfall: "2026-01", rest: 0, createdAt: T0 },
      { chargeId: "negativ", verfall: "2026-02", rest: -3, createdAt: T0 },
      { chargeId: "voll", verfall: "2026-03", rest: 5, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 2)).toEqual([{ chargeId: "voll", menge: 2 }]);
  });
});

describe("fefoVerteilung — die Kappung ist Invariante I2", () => {
  it("liefert eine KUERZERE Verteilung, wenn der Bestand nicht reicht", () => {
    // Der Aufrufer meldet die tatsaechlich gebuchte Menge (`buchung.ts:74`, `:92`).
    // Ohne die Kappung entstuende eine Buchung, die den Lagerortbestand unter 0
    // drueckt — und `buchungen` kennt kein UPDATE und kein DELETE (I1).
    const chargen: ChargeRest[] = [{ chargeId: "a", verfall: "2026-03", rest: 3, createdAt: T0 }];
    const teile = fefoVerteilung(chargen, 10);
    expect(teile).toEqual([{ chargeId: "a", menge: 3 }]);
    expect(teile.reduce((s, t) => s + t.menge, 0)).toBe(3);
  });

  it("klemmt eine negative Menge auf 0 und liefert eine LEERE Verteilung", () => {
    const chargen: ChargeRest[] = [{ chargeId: "a", verfall: "2026-03", rest: 5, createdAt: T0 }];
    expect(fefoVerteilung(chargen, -7)).toEqual([]);
    expect(fefoVerteilung(chargen, 0)).toEqual([]);
  });

  it("liefert bei leerer Chargenliste eine leere Verteilung", () => {
    expect(fefoVerteilung([], 5)).toEqual([]);
  });
});

describe("fefoVerteilung — DETERMINISMUS (§5.3.1, die neue Zusage)", () => {
  it("gleicher Verfall -> AELTERE createdAt zuerst", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "neu", verfall: "2026-03", rest: 5, createdAt: tage(10) },
      { chargeId: "alt", verfall: "2026-03", rest: 5, createdAt: tage(1) },
    ];
    expect(fefoVerteilung(chargen, 7)).toEqual([
      { chargeId: "alt", menge: 5 },
      { chargeId: "neu", menge: 2 },
    ]);
  });

  it("gleicher Verfall -> AELTERE createdAt zuerst, AUCH WENN die chargeId alphabetisch das Gegenteil nahelegt", () => {
    /**
     * ISOLIERT DIE ZWEITSTUFE. Im Test oben ist "alt" < "neu" auch alphabetisch
     * — eine Implementierung, die createdAt komplett ignoriert und bei
     * gleichem Verfall direkt auf chargeId zurueckfaellt, bestuende ihn
     * trotzdem (Review-Befund T30). Hier traegt die AELTERE Charge die
     * alphabetisch SPAETERE chargeId ("zzz") und umgekehrt: nur eine echte
     * createdAt-Sortierung besteht diesen Test.
     */
    const chargen: ChargeRest[] = [
      { chargeId: "zzz", verfall: "2026-03", rest: 5, createdAt: tage(1) },
      { chargeId: "aaa", verfall: "2026-03", rest: 5, createdAt: tage(10) },
    ];
    expect(fefoVerteilung(chargen, 7)).toEqual([
      { chargeId: "zzz", menge: 5 },
      { chargeId: "aaa", menge: 2 },
    ]);
  });

  it("gleicher Verfall UND gleiche createdAt -> chargeId entscheidet", () => {
    /**
     * DER DRITTE TIEBREAKER IST NICHT ZIERDE. `createdAt` sind UNIX-SEKUNDEN; ein
     * CSV-Import legt Dutzende Chargen in DERSELBEN Sekunde an. Ohne diese Stufe
     * waere die Ordnung dort wieder unbestimmt — dieselbe Klasse wie die
     * Journalsortierung ohne id-Tiebreaker (§5.14.4).
     */
    const chargen: ChargeRest[] = [
      { chargeId: "bbb", verfall: "2026-03", rest: 2, createdAt: T0 },
      { chargeId: "aaa", verfall: "2026-03", rest: 2, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 3)).toEqual([
      { chargeId: "aaa", menge: 2 },
      { chargeId: "bbb", menge: 1 },
    ]);
  });

  it("die Eingabeliste wird NICHT verandert (kein In-Place-Sort)", () => {
    // `[...chargen]` statt `chargen.sort()`. Der Aufrufer haelt dieselbe Liste
    // fuer die Chargen-Anzeige; ein In-Place-Sort aenderte sie unter ihm weg.
    const chargen: ChargeRest[] = [
      { chargeId: "b", verfall: "2027-01", rest: 1, createdAt: T0 },
      { chargeId: "a", verfall: "2026-01", rest: 1, createdAt: T0 },
    ];
    fefoVerteilung(chargen, 2);
    expect(chargen.map((c) => c.chargeId)).toEqual(["b", "a"]);
  });
});
