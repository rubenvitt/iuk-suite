import { describe, it, expect } from "vitest";
import { bzFaelligkeit, imBereich, bewerteKontrolle, akkuLebensdauer,
         beachtungsFelder, bzBeachtung, bzKontrollPflicht, fehlendeKontrollwerte,
         fristKontrolle, KOMPRESSE_FEHLT, KONTROLLWERT_EINER_FEHLT, KONTROLLWERT_FEHLT,
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
      ueberfaellig: false, nieGeprueft: true, nieBestanden: false,
    });
  });

  it("IDA-379: nur nicht bestandene Kontrollen — rot, nieGeprueft UND nieBestanden", () => {
    expect(bzFaelligkeit(null, NOW, true)).toMatchObject({
      faelligAm: null, ampel: "rot", ueberfaellig: false, nieGeprueft: true, nieBestanden: true,
    });
  });
});

describe("fristKontrolle — IDA-379: die Frist laeuft nur von einer bestandenen, gueltigen Kontrolle", () => {
  const k = (id: string, tage: number, bestanden: boolean, storniert = false) => ({
    id, ts: vorTagen(tage), bestanden, storniertAt: storniert ? NOW : null,
  });

  it("ueberspringt eine juengere NICHT bestandene Kontrolle fuer die Frist, nicht fuer „letzte“", () => {
    const { letzte, frist } = fristKontrolle([k("a", 20, true), k("b", 2, false)]);
    expect(letzte?.id).toBe("b");
    expect(frist?.id).toBe("a");
  });

  it("eine stornierte Kontrolle zaehlt weder als letzte noch als Frist", () => {
    const { letzte, frist } = fristKontrolle([k("a", 20, true), k("b", 2, true, true)]);
    expect(letzte?.id).toBe("a");
    expect(frist?.id).toBe("a");
  });

  it("nur stornierte oder keine Kontrollen → beide null", () => {
    expect(fristKontrolle([k("a", 2, true, true)])).toEqual({ letzte: null, frist: null });
    expect(fristKontrolle([])).toEqual({ letzte: null, frist: null });
  });

  it("bei GLEICHEM ts gewinnt die hoehere id — wie im Logbuch", () => {
    expect(fristKontrolle([k("tie-b", 1, true), k("tie-a", 1, true)]).frist?.id).toBe("tie-b");
  });
});

describe("Pflichtwerte — IDA-379: genau das, was fuer „bestanden“ zaehlt", () => {
  const ohne = { level1Min: null, level1Max: null, level2Min: null, level2Max: null };
  const voll = { level1Wert: 50, level2Wert: 300, kompresseVerfall: "2027-05" };

  it("jedes konfigurierte Level ist Pflicht, ein halb konfiguriertes nicht", () => {
    expect(bzKontrollPflicht({ ...ohne, level1Min: 40, level1Max: 60, level2Max: 350 }))
      .toEqual({ level1: true, level2: false, eines: false });
  });

  it("ohne konfiguriertes Level ist mindestens ein Messwert Pflicht", () => {
    const pflicht = bzKontrollPflicht(ohne);
    expect(pflicht).toEqual({ level1: false, level2: false, eines: true });
    expect(fehlendeKontrollwerte(pflicht, { ...voll, level1Wert: null, level2Wert: null }))
      .toEqual({ level1Wert: KONTROLLWERT_EINER_FEHLT });
    expect(fehlendeKontrollwerte(pflicht, { ...voll, level1Wert: null })).toEqual({});
  });

  it("meldet fehlende Level und den Kompressen-Verfall je Feld", () => {
    const pflicht = bzKontrollPflicht({ level1Min: 40, level1Max: 60, level2Min: 250, level2Max: 350 });
    expect(fehlendeKontrollwerte(pflicht, { level1Wert: null, level2Wert: null, kompresseVerfall: null }))
      .toEqual({
        level1Wert: KONTROLLWERT_FEHLT, level2Wert: KONTROLLWERT_FEHLT, kompresseVerfall: KOMPRESSE_FEHLT,
      });
    expect(fehlendeKontrollwerte(pflicht, voll)).toEqual({});
  });

  it("ein vollstaendig gefuellter Pflichtsatz ist nie eine LEERE Kontrolle (Regel 1)", () => {
    // Die Pflicht schliesst genau den Fall aus dem Ticket aus: ein leer
    // abgeschicktes Formular, das als „NICHT bestanden" gespeichert wurde.
    const leer = { level1Wert: null, level2Wert: null, kompresseVerfall: null };
    for (const g of [ohne, { ...ohne, level1Min: 1, level1Max: 9 }]) {
      expect(Object.keys(fehlendeKontrollwerte(bzKontrollPflicht(g), leer))).toContain("level1Wert");
    }
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

describe("bzBeachtung — DER TEXT IST DER ZUSTAND", () => {
  it("ohne Hinweis: keine Beachtung, und `seit` bleibt leer", () => {
    expect(bzBeachtung({ beachtungHinweis: null, beachtungSeit: null })).toEqual({
      erforderlich: false, hinweis: null, seit: null,
    });
  });

  it("mit Hinweis: erforderlich, Text getrimmt, `seit` durchgereicht", () => {
    const seit = new Date("2026-06-01T08:00:00Z");
    expect(bzBeachtung({ beachtungHinweis: "  Display flackert  ", beachtungSeit: seit }))
      .toEqual({ erforderlich: true, hinweis: "Display flackert", seit });
  });

  /**
   * ⚠️ DIE FALLE DIESER FUNKTION. Ein `!== null` an einer Anzeigestelle faende
   * hier eine Beachtung und zeigte einen gelben Chip, dessen Begruendung ein
   * Leerzeichen ist — die Farbe ohne Aussage, die DRK-311 ausschliesst.
   */
  it("ein Hinweis aus lauter Leerzeichen ist KEIN Hinweis", () => {
    expect(bzBeachtung({
      beachtungHinweis: "   ",
      beachtungSeit: new Date("2026-06-01T08:00:00Z"),
    })).toEqual({ erforderlich: false, hinweis: null, seit: null });
  });

  /**
   * Eine Altzeile kann einen Hinweis ohne Zeitstempel tragen. Sie ist eine
   * gueltige Beachtung — nur eben eine ohne Standzeit; die Anzeige muss beides
   * vertragen, statt am fehlenden Datum zu haengen.
   */
  it("Hinweis ohne Zeitstempel bleibt eine Beachtung", () => {
    expect(bzBeachtung({ beachtungHinweis: "Akku schwach", beachtungSeit: null }))
      .toEqual({ erforderlich: true, hinweis: "Akku schwach", seit: null });
  });
});

describe("beachtungsFelder — setzen, umformulieren, aufheben", () => {
  const JETZT = new Date("2026-06-15T12:00:00Z");
  const FRUEHER = new Date("2026-05-20T09:00:00Z");
  const OHNE = { beachtungHinweis: null, beachtungSeit: null };

  it("setzt `seit` auf jetzt, wenn vorher keine Beachtung lief", () => {
    expect(beachtungsFelder(OHNE, "Display flackert", JETZT)).toEqual({
      beachtungHinweis: "Display flackert", beachtungSeit: JETZT,
    });
  });

  /**
   * ⚠️ DIE ZAHL, AN DER MAN MERKT, DASS SICH NIEMAND KUEMMERT. Ein `seit =
   * jetzt` bei jedem Speichern machte aus einem vier Wochen alten Missstand
   * still einen frischen — und zwar genau dann, wenn jemand den Satz
   * praeziser fasst, also beim gutgemeinten Handgriff.
   */
  it("laesst `seit` stehen, wenn nur der Text umformuliert wird", () => {
    expect(beachtungsFelder(
      { beachtungHinweis: "Display flackert", beachtungSeit: FRUEHER },
      "Display flackert beim Einschalten",
      JETZT,
    )).toEqual({
      beachtungHinweis: "Display flackert beim Einschalten", beachtungSeit: FRUEHER,
    });
  });

  it("faengt die Altzeile ohne Zeitstempel mit jetzt ab", () => {
    expect(beachtungsFelder(
      { beachtungHinweis: "Akku schwach", beachtungSeit: null }, "Akku schwach", JETZT,
    )).toEqual({ beachtungHinweis: "Akku schwach", beachtungSeit: JETZT });
  });

  /** ⚠️ BEIDE Spalten zurueck. Ein stehengebliebenes `seit` ohne Text waere ein
   *  Datum, zu dem es nichts gibt. */
  it("hebt auf und raeumt dabei auch den Zeitstempel weg", () => {
    expect(beachtungsFelder(
      { beachtungHinweis: "Display flackert", beachtungSeit: FRUEHER }, null, JETZT,
    )).toEqual({ beachtungHinweis: null, beachtungSeit: null });
  });

  /** Ein vorher leerer Stand, der leer bleibt — das Aufheben ist idempotent. */
  it("bleibt beim Aufheben ohne laufende Beachtung folgenlos", () => {
    expect(beachtungsFelder(OHNE, null, JETZT)).toEqual({
      beachtungHinweis: null, beachtungSeit: null,
    });
  });
});
