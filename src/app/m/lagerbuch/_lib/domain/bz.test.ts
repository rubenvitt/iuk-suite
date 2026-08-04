import { describe, it, expect } from "vitest";
import { bzFaelligkeit, imBereich, bewerteKontrolle, akkuLebensdauer,
         BZ_KONTROLL_INTERVALL_TAGE, BZ_WARN_TAGE } from "./bz";

const NOW = new Date("2026-06-15T12:00:00Z");
const vorTagen = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("bzFaelligkeit — NIE GEPRUEFT ist die Falle", () => {
  it("liefert rot MIT ueberfaellig: false", () => {
    /**
     * ⚠️ `ueberfaellig === false` heisst hier NICHT „alles gut". Jede Anzeige muss
     * `nieGeprueft` EIGENSTAENDIG behandeln — sonst steht „nicht ueberfaellig"
     * neben einer roten Ampel, und der Satz ist beruhigend, obwohl das Geraet der
     * schlechteste Fall im Bestand ist (§5.11).
     */
    expect(bzFaelligkeit(null, NOW)).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "rot",
      ueberfaellig: false, nieGeprueft: true,
    });
  });
});

describe("bzFaelligkeit — 31 Tage, Warnfenster 5", () => {
  it("faelligAm ist letzteKontrolle + 31 Tage", () => {
    const letzte = vorTagen(10);
    const f = bzFaelligkeit(letzte, NOW);
    expect(f.faelligAm?.getTime()).toBe(letzte.getTime() + 31 * 86_400_000);
    expect(f.nieGeprueft).toBe(false);
  });

  it("frisch geprueft ist gruen", () => {
    expect(bzFaelligkeit(vorTagen(1), NOW).ampel).toBe("gruen");
  });

  it("die Warnkante: 5 Tage vor Faelligkeit ist GELB, 6 ist gruen", () => {
    // tageBisFaellig ist AUFGERUNDET (Math.ceil).
    expect(bzFaelligkeit(vorTagen(26), NOW).tageBisFaellig).toBe(5);
    expect(bzFaelligkeit(vorTagen(26), NOW).ampel).toBe("gelb");
    expect(bzFaelligkeit(vorTagen(25), NOW).tageBisFaellig).toBe(6);
    expect(bzFaelligkeit(vorTagen(25), NOW).ampel).toBe("gruen");
  });

  it("die Faelligkeitskante: genau 31 Tage her ist GELB, NICHT ueberfaellig", () => {
    // faelligAm === now (tageBisFaellig 0): noch nicht ueberfaellig (strikt <),
    // aber im Warnfenster. Wer die Rand-Ungleichung von `<` auf `<=` dreht (oder
    // umgekehrt), rutscht genau hier von gelb auf rot bzw. verliert die
    // ueberfaellig-Grenze.
    const f = bzFaelligkeit(vorTagen(31), NOW);
    expect(f.tageBisFaellig).toBe(0);
    expect(f.ueberfaellig).toBe(false);
    expect(f.ampel).toBe("gelb");
  });

  it("ueber 31 Tage her ist rot UND ueberfaellig", () => {
    const f = bzFaelligkeit(vorTagen(40), NOW);
    expect(f.ampel).toBe("rot");
    expect(f.ueberfaellig).toBe(true);
    expect(f.nieGeprueft).toBe(false);
    expect(f.tageBisFaellig).toBeLessThan(0);
  });

  it("die zwei Konstanten tragen ihre Einheit im Namen", () => {
    expect(BZ_KONTROLL_INTERVALL_TAGE).toBe(31);
    expect(BZ_WARN_TAGE).toBe(5);
  });

  it("rechnet ZONEN-UNABHAENGIG (reine ms-Arithmetik, §5.16)", () => {
    // Ueber einen Zeitumstellungstag hinweg: 31 Tage bleiben 31 · 86 400 000 ms.
    // Wer die Rechnung „vereinheitlicht" und ueber _lib/zeit.ts schickt, macht aus
    // einem 31-Tage-Intervall ploetzlich 30 oder 32 Tage.
    const vorUmstellung = new Date("2026-03-15T12:00:00Z");
    const f = bzFaelligkeit(vorUmstellung, new Date("2026-04-10T12:00:00Z"));
    expect(f.faelligAm?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });
});

describe("imBereich", () => {
  it("liefert null, wenn IRGENDEIN Wert fehlt", () => {
    expect(imBereich(null, 1, 9)).toBeNull();
    expect(imBereich(5, null, 9)).toBeNull();
    expect(imBereich(5, 1, null)).toBeNull();
  });

  it("ist an beiden Raendern INKLUSIV", () => {
    expect(imBereich(1, 1, 9)).toBe(true);
    expect(imBereich(9, 1, 9)).toBe(true);
    expect(imBereich(0, 1, 9)).toBe(false);
    expect(imBereich(10, 1, 9)).toBe(false);
  });
});

describe("bewerteKontrolle — die drei Regeln", () => {
  const leer = {
    level1Wert: null, level1Min: null, level1Max: null,
    level2Wert: null, level2Min: null, level2Max: null,
  };

  it("Regel 1: eine KOMPLETT LEERE Kontrolle ist NICHT bestanden", () => {
    // Verhindert „vacuously true". Ohne diese Regel waere jede durchgeklickte
    // leere Kontrolle ein bestandener Nachweis.
    expect(bewerteKontrolle(leer).bestanden).toBe(false);
  });

  it("Regel 2: ein konfiguriertes Level muss GEMESSEN und IM BEREICH sein", () => {
    expect(bewerteKontrolle({
      ...leer, level1Wert: 5, level1Min: 1, level1Max: 9,
    }).bestanden).toBe(true);
    expect(bewerteKontrolle({
      ...leer, level1Wert: 12, level1Min: 1, level1Max: 9,
    }).bestanden).toBe(false);
  });

  it("Regel 2: ein konfiguriertes, aber NICHT GEMESSENES Level laesst bestanden fallen", () => {
    // Level 2 ist konfiguriert, aber nicht gemessen — obwohl Level 1 stimmt, ist
    // die Kontrolle nicht bestanden. Genau das ist der Fall, den ein naiver Port
    // verliert, wenn er nur ueber die GEMESSENEN Level iteriert.
    expect(bewerteKontrolle({
      level1Wert: 5, level1Min: 1, level1Max: 9,
      level2Wert: null, level2Min: 100, level2Max: 200,
    }).bestanden).toBe(false);
  });

  it("Regel 3: kein Level konfiguriert, aber ein Wert erfasst -> bestanden", () => {
    expect(bewerteKontrolle({ ...leer, level1Wert: 42 }).bestanden).toBe(true);
  });

  it("meldet die beiden Bereichsurteile getrennt zurueck", () => {
    const b = bewerteKontrolle({
      level1Wert: 5, level1Min: 1, level1Max: 9,
      level2Wert: 300, level2Min: 100, level2Max: 200,
    });
    expect(b.level1ImBereich).toBe(true);
    expect(b.level2ImBereich).toBe(false);
    expect(b.bestanden).toBe(false);
  });
});

describe("akkuLebensdauer", () => {
  it("liefert bei 0 und 1 Wechsel tageDurchschnitt: null", () => {
    expect(akkuLebensdauer([])).toEqual(
      { tageDurchschnitt: null, anzahlWechsel: 0, anzahlIntervalle: 0 });
    expect(akkuLebensdauer([NOW])).toEqual(
      { tageDurchschnitt: null, anzahlWechsel: 1, anzahlIntervalle: 0 });
  });

  it("mittelt bei 2 Wechseln ein Intervall", () => {
    expect(akkuLebensdauer([vorTagen(100), NOW])).toEqual(
      { tageDurchschnitt: 100, anzahlWechsel: 2, anzahlIntervalle: 1 });
  });

  it("mittelt bei 3 Wechseln zwei Intervalle", () => {
    expect(akkuLebensdauer([vorTagen(300), vorTagen(100), NOW])).toEqual(
      { tageDurchschnitt: 150, anzahlWechsel: 3, anzahlIntervalle: 2 });
  });

  it("sortiert selbst und veraendert die Eingabe NICHT", () => {
    const eingabe = [NOW, vorTagen(300), vorTagen(100)];
    expect(akkuLebensdauer(eingabe).tageDurchschnitt).toBe(150);
    expect(eingabe[0]).toBe(NOW);
  });
});
