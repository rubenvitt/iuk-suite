import { describe, it, expect } from "vitest";
import {
  fuellstandProzent,
  o2Status,
  wechselGrenzeBar,
  O2_WECHSEL_VORGABE_PROZENT,
  O2_WECHSEL_MIN_PROZENT,
  O2_WECHSEL_MAX_PROZENT,
  O2_AMPEL_GELB_PROZENT,
} from "./o2";

describe("fuellstandProzent", () => {
  it("rundet auf ganze Prozent", () => {
    expect(fuellstandProzent(150, 200)).toBe(75);
    expect(fuellstandProzent(100, 300)).toBe(33); // 33,33 → 33
    expect(fuellstandProzent(200, 300)).toBe(67); // 66,67 → 67
  });

  it("klemmt NICHT auf 100 — Ueberfuellung bleibt sichtbar", () => {
    // Ein `Progress`, der bei 100 deckelt, verliert diese Aussage (§5.12,
    // Eigenschaft 1). Das ist eine Auflage an die Darstellung (Teil 5), aber die
    // ZAHL entsteht hier.
    expect(fuellstandProzent(220, 200)).toBe(110);
  });

  it("liefert bei nenn <= 0 genau 0 — kein Fehler, keine Division durch null", () => {
    expect(fuellstandProzent(150, 0)).toBe(0);
    expect(fuellstandProzent(150, -50)).toBe(0);
  });

  it("liefert bei Druck 0 genau 0", () => {
    expect(fuellstandProzent(0, 200)).toBe(0);
  });
});

describe("o2Status — die Kante des Wechselhinweises", () => {
  it("Erreichen des Grenzwerts heisst <=: genau der Grenzwert ist ROT (DRK-308)", () => {
    // ⚠️ AENDERUNG GEGEN DEN STAND VOR DRK-308. Dort galt `prozent < 25`, und
    // genau 25 % waren GELB. Das Akzeptanzkriterium sagt „bei Erreichen des
    // vereinbarten Grenzwerts wird der Wechselbedarf sichtbar" — die Kante
    // gehoert also zum Hinweis, nicht zur Vorwarnung.
    expect(o2Status(50, 200).prozent).toBe(25);
    expect(o2Status(50, 200).ampel).toBe("rot");
    expect(o2Status(50, 200).wechseln).toBe(true);
    // Ein bar darueber ist die Vorwarnung.
    expect(o2Status(51, 200).ampel).toBe("gelb");
    expect(o2Status(51, 200).wechseln).toBe(false);
  });

  it("entscheidet ganzzahlig, NICHT ueber die gerundete Prozentzahl", () => {
    // Der Fall, den eine Rundung still falsch entscheidet: 25 % von 210 bar sind
    // 52,5 bar. 53 bar liegen DARUEBER und runden trotzdem auf 25 %.
    const knappDarueber = o2Status(53, 210);
    expect(knappDarueber.prozent).toBe(25); // die ANZEIGE sagt „25 %" …
    expect(knappDarueber.ampel).toBe("gelb"); // … die ENTSCHEIDUNG sagt „noch nicht"
    // 52 bar liegen darunter und sind rot — bei identischer Anzeigezahl.
    const knappDarunter = o2Status(52, 210);
    expect(knappDarunter.prozent).toBe(25);
    expect(knappDarunter.ampel).toBe("rot");
  });

  it("die GELBE Kante entscheidet ebenfalls exakt, nicht über die Rundung (DRK-356)", () => {
    // 104 bar von 210 sind 49,52 % und runden auf 50. Die Anzeige sagt „50 %",
    // die Ampel sagt gelb — „unter 50 %" gilt wörtlich, wie an der roten Kante
    // „25 %" bei 53 bar von 210 gelb ist. Bis DRK-356 war dieser Fall grün.
    expect(o2Status(104, 210).prozent).toBe(50);
    expect(o2Status(104, 210).ampel).toBe("gelb");
    // 105 bar von 210 sind genau 50,0 %: die Kante selbst bleibt grün.
    expect(o2Status(105, 210).ampel).toBe("gruen");
    // Die rote Kante derselben Flasche rechnet ebenso (52 statt 53 bar).
    expect(o2Status(52, 210).ampel).toBe("rot");
    expect(o2Status(53, 210).ampel).toBe("gelb");
  });

  it("49 % ist gelb, 50 % ist gruen", () => {
    expect(o2Status(98, 200).prozent).toBe(49);
    expect(o2Status(98, 200).ampel).toBe("gelb");
    expect(o2Status(100, 200).prozent).toBe(50);
    expect(o2Status(100, 200).ampel).toBe("gruen");
  });

  it("die Schwellen stehen als benannte Konstanten und tragen ihre Einheit", () => {
    expect(O2_WECHSEL_VORGABE_PROZENT).toBe(25);
    expect(O2_AMPEL_GELB_PROZENT).toBe(50);
    expect(O2_WECHSEL_MIN_PROZENT).toBe(1);
    expect(O2_WECHSEL_MAX_PROZENT).toBe(99);
  });

  it("ohne dritten Parameter gilt die Vorbelegung — die Umstellung ist additiv", () => {
    expect(o2Status(60, 200)).toEqual(o2Status(60, 200, O2_WECHSEL_VORGABE_PROZENT));
  });
});

describe("o2Status — der konfigurierte Grenzwert", () => {
  it("verschiebt die Kante mit, ohne den gelben Bereich anzufassen", () => {
    // 30 % von 200 bar = 60 bar. Bei Vorgabe 25 % waere das gelb.
    expect(o2Status(60, 200).ampel).toBe("gelb");
    expect(o2Status(60, 200, 30).ampel).toBe("rot");
    expect(o2Status(61, 200, 30).ampel).toBe("gelb");
    // Die Gruen-Kante bleibt, wo sie war.
    expect(o2Status(100, 200, 30).ampel).toBe("gruen");
  });

  it("⚠️ 25 % und 50 bar sind NUR bei Nennfuelldruck 200 dasselbe", () => {
    // Genau die Warnung aus dem Ticket. Bei 200 bar fallen beide Lesarten
    // zusammen …
    expect(wechselGrenzeBar(200, 25)).toBe(50);
    // … bei 300 bar nicht mehr: 25 % sind 75 bar, nicht 50.
    expect(wechselGrenzeBar(300, 25)).toBe(75);
    // Eine 300-bar-Flasche bei 60 bar ist nach der Prozentregel faellig …
    expect(o2Status(60, 300).wechseln).toBe(true);
    // … und waere es nach der absoluten 50-bar-Lesart noch nicht. Wer die will,
    // traegt sie als Prozentwert ein: 50/300 = 16,67 % → 17 %.
    expect(o2Status(60, 300, 17).wechseln).toBe(false);
    expect(o2Status(51, 300, 17).wechseln).toBe(true);
  });

  it("schluckt den gelben Bereich, wenn der Wechselwert ihn erreicht", () => {
    // Dokumentierte Folge, kein Fehler: die Ampel hat dann zwei Stufen.
    expect(o2Status(100, 200, 50).ampel).toBe("rot");
    expect(o2Status(101, 200, 50).ampel).toBe("gruen");
    expect(o2Status(120, 200, 60).ampel).toBe("rot");
    expect(o2Status(121, 200, 60).ampel).toBe("gruen");
  });

  it("nennt den Grenzwert, gegen den GENAU DIESE Bewertung entstand", () => {
    const s = o2Status(80, 300, 30);
    expect(s.wechselAbProzent).toBe(30);
    expect(s.wechselAbBar).toBe(90);
    expect(s.wechseln).toBe(true);
  });

  it("⚠️ die genannte bar-Zahl LOEST AUS — die Anzeige und die Regel fallen zusammen", () => {
    // DIE EIGENSCHAFT, NICHT DIE RUNDUNG. Was hier zaehlt, ist das Verhaeltnis
    // zweier Funktionen: die Zahl, die jede Maske ausschreibt, muss der Regel
    // genuegen, gegen die sie ausgeschrieben wird. Ein Test auf `toBe(52)`
    // allein bliebe gruen, wenn jemand spaeter `o2Status` auf `<` umstellt.
    for (const [nenn, prozent] of [[210, 25], [200, 25], [300, 17], [150, 33], [200, 49]]) {
      const grenze = wechselGrenzeBar(nenn, prozent);
      expect(o2Status(grenze, nenn, prozent).wechseln).toBe(true);
      expect(o2Status(grenze + 1, nenn, prozent).wechseln).toBe(false);
    }
    // Der Fall aus der ersten Reviewrunde, ausgeschrieben: 25 % von 210 bar sind
    // 52,5. AUFgerundet nannte die Maske 53 bar — und bei 53 bar geschieht
    // nichts. Auf Papier steht diese Zahl neben dem Messfeld.
    expect(wechselGrenzeBar(210, 25)).toBe(52);
    expect(o2Status(52, 210).wechseln).toBe(true);
    expect(o2Status(53, 210).wechseln).toBe(false);
  });

  it("⚠️ ganze Prozent treffen nicht jeden bar-Wert — die Grenze ist benannt", () => {
    // KEINE REGRESSION, SONDERN EINE EIGENSCHAFT DER HEUTIGEN DARSTELLUNG, und
    // sie steht hier, damit sie nicht erst in einer Abnahme auffaellt: an einer
    // 300-bar-Flasche sind 50 bar (die absolute Lesart der Gespraechsnotiz)
    // nicht einstellbar — 16 % liegen bei 48 bar, 17 % bei 51.
    expect(wechselGrenzeBar(300, 16)).toBe(48);
    expect(wechselGrenzeBar(300, 17)).toBe(51);
    // Die gesuchten 50 bar liegen dazwischen: KEIN ganzer Prozentwert trifft sie.
    const treffer = Array.from({ length: 99 }, (_, i) => i + 1)
      .filter((prozent) => wechselGrenzeBar(300, prozent) === 50);
    expect(treffer).toEqual([]);
    // Bei 200 bar geht dieselbe Zahl glatt auf — deshalb faellt es dort nicht auf.
    expect(wechselGrenzeBar(200, 25)).toBe(50);
    //
    // Faellt die Abstimmung aus DRK-308 auf die absolute Lesart, ist die Antwort
    // NICHT eine Nachkommastelle, sondern ein Wechselwert in bar. Dieser Test
    // wird dann angepasst — und genau das ist sein Zweck: die Umstellung soll
    // auffallen, nicht durchrutschen.
  });

  it("liefert bei nenn <= 0 eine 0 als Grenzwert in bar", () => {
    expect(wechselGrenzeBar(0, 25)).toBe(0);
    expect(wechselGrenzeBar(-10, 25)).toBe(0);
  });
});

describe("o2Status — `niedrig` und `wechseln` sind genau `ampel === 'rot'`", () => {
  it("sind wahr bei rot und falsch sonst", () => {
    expect(o2Status(40, 200).niedrig).toBe(true);
    expect(o2Status(40, 200).wechseln).toBe(true);
    expect(o2Status(60, 200).niedrig).toBe(false);
    expect(o2Status(60, 200).wechseln).toBe(false);
    expect(o2Status(150, 200).niedrig).toBe(false);
  });

  it("sind bei nenn <= 0 WAHR — 0 % ist rot", () => {
    // Der Grenzfall, den die Zaehler `flaschenAuffaellig` sehen: eine Flasche mit
    // Nennfuelldruck 0 im Stamm zaehlt als auffaellig. Das ist richtig — sie ist
    // fehlkonfiguriert und gehoert angesehen. Zu unterscheiden vom Fall
    // „Nennfuelldruck UNBEKANNT" (§5.12), der gar nicht erst hier ankommt.
    //
    // ⚠️ DIESER ZWEIG IST EIN EIGENER GUARD, keine Folge der Formel. Ohne ihn
    // waere `druck * 100 <= grenze * 0` nur bei Druck 0 wahr, und eine
    // fehlkonfigurierte Flasche erschiene still GRUEN.
    expect(o2Status(150, 0)).toEqual({
      prozent: 0, ampel: "rot", niedrig: true, wechseln: true,
      wechselAbProzent: 25, wechselAbBar: 0,
    });
    expect(o2Status(150, 0, 40).ampel).toBe("rot");
  });
});
