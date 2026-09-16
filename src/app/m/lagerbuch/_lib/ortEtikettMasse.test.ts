import { describe, it, expect } from "vitest";
import { A4_BREITE_MM, A4_HOEHE_MM, ORT_KARTE_BREITE_MM, ORT_KARTE_HOEHE_MM,
         ORT_SEITENRAND_MM, ORT_SPALTEN, ORT_ZEILEN, ORT_JE_BLATT,
         NAME_STUFEN, nameStufe, mm } from "./ortEtikettMasse";

/**
 * DIE MASSE DER ORTSKARTE — DRK-312, Bogenformat DRK-388.
 *
 * ⚠️ DIESE DATEI PRUEFT DIE ENTSCHEIDUNG, NIE DIE WIRKUNG. Ob die Stufen wirklich
 * passen, kann nur ein echter Browser sagen — jsdom rechnet keine Layoutboxen,
 * und `getBoundingClientRect()` liefert dort ueberall Nullen. Die Zahlen in
 * `NAME_STUFEN` sind gemessen (die Messreihe steht im Kopf der Tabelle), und
 * `e2e/lagerbuch-ortsetiketten.spec.ts` misst nach, dass kein Name still
 * abgeschnitten wird.
 */

describe("das Raster auf dem Blatt", () => {
  const bedruckbarB = A4_BREITE_MM - 2 * ORT_SEITENRAND_MM;
  const bedruckbarH = A4_HOEHE_MM - 2 * ORT_SEITENRAND_MM;

  /**
   * ACHT KARTEN JE BLATT — die Zusage des Tickets, und sie haengt an genau
   * dieser Rechnung. Der Test ist eine Ungleichung und keine Gleichung: die
   * Karte DARF kleiner sein als ihre Zelle (das Spiel faengt Chromiums
   * Pixelrechnung ab), sie darf nur nicht groesser sein.
   */
  it("bringt zwei Spalten und vier Zeilen auf den bedruckbaren Bereich", () => {
    expect(ORT_SPALTEN * ORT_KARTE_BREITE_MM).toBeLessThanOrEqual(bedruckbarB);
    expect(ORT_ZEILEN * ORT_KARTE_HOEHE_MM).toBeLessThanOrEqual(bedruckbarH);
    expect(ORT_JE_BLATT).toBe(8);
  });

  /**
   * ⚠️ DIE GEGENPROBE IST DIE HAELFTE DES TESTS. Ohne sie bliebe der Test gruen,
   * waehrend die Karte auf ein Drittel schrumpft — dann passten neun oder zwoelf
   * auf das Blatt, und „acht je Blatt" waere still gelogen. Eine weitere Spalte
   * bzw. Zeile MUSS ueber den Rand laufen.
   */
  it("laesst keine dritte Spalte und keine fuenfte Zeile zu", () => {
    expect((ORT_SPALTEN + 1) * ORT_KARTE_BREITE_MM).toBeGreaterThan(bedruckbarB);
    expect((ORT_ZEILEN + 1) * ORT_KARTE_HOEHE_MM).toBeGreaterThan(bedruckbarH);
  });

  /**
   * ⚠️ QUER, NICHT HOCHKANT — das ist der Auftrag hinter DRK-388. Hochkant
   * passen vier Karten auf das Blatt, nicht acht; ein vertauschtes Zahlenpaar
   * faende sonst kein Tor.
   */
  it("legt die Karte quer", () => {
    expect(ORT_KARTE_BREITE_MM).toBeGreaterThan(ORT_KARTE_HOEHE_MM);
  });

  it("schreibt Millimeter ohne nachlaufende Null", () => {
    expect(mm(A4_BREITE_MM)).toBe("210mm");
    expect(mm(ORT_KARTE_HOEHE_MM)).toBe("72mm");
  });
});

describe("NAME_STUFEN", () => {
  /**
   * ⚠️ DIE REIHENFOLGE IST DER ALGORITHMUS, NICHT NUR KOSMETIK: `nameStufe`
   * nimmt die ERSTE passende Stufe. Stuenden sie durcheinander, bekaeme ein
   * kurzer Name still einen zu kleinen Grad — und niemand sieht einer Karte an,
   * dass sie groesser haette sein koennen.
   */
  it("steht von gross nach klein", () => {
    const grade = NAME_STUFEN.map((s) => s.pt);
    expect(grade).toEqual([...grade].sort((a, b) => b - a));
  });

  it("laesst die Grenzen mit dem Grad wachsen", () => {
    const zeichen = NAME_STUFEN.map((s) => s.bisZeichen ?? Infinity);
    expect(zeichen).toEqual([...zeichen].sort((a, b) => a - b));
    const woerter = NAME_STUFEN.map((s) => s.bisWort);
    expect(woerter).toEqual([...woerter].sort((a, b) => a - b));
  });

  /**
   * ⚠️ NUR DIE LETZTE STUFE DARF OFFEN SEIN. Eine offene Stufe MITTENDRIN
   * machte jede Stufe danach unerreichbar — die Suche stiege dort aus, und die
   * kleineren Grade waeren toter Code, ohne dass ein Tor etwas meldet.
   */
  it("hat genau eine offene Stufe, und das ist die letzte", () => {
    const offen = NAME_STUFEN.filter((s) => s.bisZeichen === null);
    expect(offen).toHaveLength(1);
    expect(NAME_STUFEN[NAME_STUFEN.length - 1]!.bisZeichen).toBeNull();
  });

  /** Mehr Zeilen bei kleinerem Grad — die Klammerwerte gehoeren zur Stufe. */
  it("klammert bei kleinerem Grad mehr Zeilen", () => {
    const zeilen = NAME_STUFEN.map((s) => s.zeilen);
    expect(zeilen).toEqual([...zeilen].sort((a, b) => a - b));
  });
});

describe("nameStufe", () => {
  const klasse = (n: number) => NAME_STUFEN[n]!.klasse;

  it("gibt kurzen Namen den groessten Grad", () => {
    expect(nameStufe("RTW 1")).toBe(klasse(0));
    expect(nameStufe("Rucksack Betreuung")).toBe(klasse(0));
  });

  /**
   * ⚠️ DER FALL, DER DIE ZWEITE SPALTE UEBERHAUPT ERZWUNGEN HAT.
   * „Sanitätstasche 1" hat nur 16 Zeichen und faellt damit in die groesste
   * Stufe — aber „Sanitätstasche" allein ist in der Namensspalte (43mm) bei
   * 20pt zu breit und brach als „Sanitätstasch / e 1" um. Nichts war
   * abgeschnitten, und trotzdem war es falsch.
   */
  it("geht wegen eines breiten WORTES eine Stufe herunter, nicht wegen der Laenge", () => {
    expect([..."Sanitätstasche 1"].length).toBeLessThanOrEqual(NAME_STUFEN[0]!.bisZeichen!);
    // Zwei Stufen herunter, nicht eine: die Namensspalte der Querkarte ist
    // 43mm breit statt 56mm, und „Sanitätstasche" ist 14 Zeichen lang.
    expect(nameStufe("Sanitätstasche 1")).toBe(klasse(2));
  });

  it("steigt mit der Laenge Stufe fuer Stufe ab", () => {
    expect(nameStufe("RTW 1")).toBe(klasse(0));
    expect(nameStufe("Betreuungsbus 1")).toBe(klasse(1));
    expect(nameStufe("Rucksack Betreuung Einsatzeinheit 3")).toBe(klasse(2));
    expect(nameStufe(
      "Rucksack Betreuung EE 3 Reserve Nord Sued Ost West Zwei Drei Vier Fuenf Sechs Sieben Acht",
    )).toBe(klasse(3));
  });

  /**
   * ⚠️ DIE HOEHE GEWINNT GEGEN DEN WORTWUNSCH.
   * „Mannschaftstransportwagen" hat 25 Zeichen und passt auf KEINER Stufe auf
   * eine Zeile. Schluege der Wortwunsch durch, staende ein Name mit 57 Zeichen
   * in 9pt da, obwohl 13pt ihn vollstaendig truegen — der Preis waere falsch
   * herum bezahlt: ein Mittenbruch ist haesslich, eine zu kleine Schrift auf
   * einem laminierten Kaertchen ist unbenutzbar.
   */
  it("nimmt bei einem unteilbar langen Wort trotzdem den Grad, den die Hoehe erlaubt", () => {
    const name = "Mannschaftstransportwagen der Bereitschaft Nord Reserve 2";
    expect(Math.max(...name.split(" ").map((w) => w.length)))
      .toBeGreaterThan(NAME_STUFEN[NAME_STUFEN.length - 1]!.bisWort);
    // 57 Zeichen — die Hoehe erlaubt Stufe 1 (16pt, bis 61 Zeichen), obwohl
    // das laengste Wort auf KEINER Stufe auf eine Zeile passt.
    expect([...name].length).toBeLessThanOrEqual(NAME_STUFEN[1]!.bisZeichen!);
    expect(nameStufe(name)).toBe(klasse(1));
  });

  it("faellt fuer einen sehr langen Namen auf die kleinste Stufe", () => {
    expect(nameStufe("Sehr langer Name ".repeat(12))).toBe(klasse(NAME_STUFEN.length - 1));
  });

  /**
   * ⚠️ UEBER CODEPUNKTE, NICHT UEBER `name.length`. Jenes zaehlt
   * UTF-16-Einheiten; ein Zeichen ausserhalb der BMP zaehlte doppelt und die
   * Stufe waere still zu klein. Gemessen wird das an einem Namen, dessen
   * `.length` die Grenze reisst und dessen Codepunktzahl sie haelt.
   */
  it("zaehlt Codepunkte", () => {
    const name = "𝐀".repeat(NAME_STUFEN[0]!.bisZeichen!);   // je 2 UTF-16-Einheiten
    expect(name.length).toBeGreaterThan(NAME_STUFEN[0]!.bisZeichen!);
    expect([...name].length).toBe(NAME_STUFEN[0]!.bisZeichen);
    /*
     * ⚠️ DER NAME PASST GENAU IN DIE GROESSTE STUFE — nach Codepunkten. Wer
     * `name.length` zaehlte, saehe die doppelte Zahl und ginge eine Stufe
     * herunter: die Karte saehe richtig aus und truege still eine zu kleine
     * Schrift. (Die Wortbedingung greift hier fuer keine Stufe, das Wort hat
     * keine Trennstelle — es entscheidet also allein die Laenge.)
     */
    expect(nameStufe(name)).toBe(klasse(0));
    expect(nameStufe("𝐀".repeat(NAME_STUFEN[0]!.bisZeichen! + 1))).toBe(klasse(1));
  });

  it("kommt mit einem leeren Namen zurecht", () => {
    expect(nameStufe("")).toBe(klasse(0));
  });

  it("liefert immer eine Klasse aus der Tabelle", () => {
    const bekannt = new Set(NAME_STUFEN.map((s) => s.klasse));
    for (const n of ["", "x", "x ".repeat(200), "y".repeat(400), "Ä Ö Ü"]) {
      expect(bekannt.has(nameStufe(n)), n.slice(0, 20)).toBe(true);
    }
  });
});
