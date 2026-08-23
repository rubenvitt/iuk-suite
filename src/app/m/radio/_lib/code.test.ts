// src/app/m/radio/_lib/code.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ALPHABET, erzeugeCode, normalisiereCode, istCodeForm } from "./code";

/**
 * DER CODERAUM (Spec 1 §3.2.1, Zeilen 2053-2124; Testauftrag §3.8, Zeilen 3076-3081).
 *
 * ⛔ DIE LAENGE 28 IST HIER EINE ZUSICHERUNG, KEINE BEQUEMLICHKEIT. Spec:3056-3068:
 * „Wer den Coderaum aus 3.2.1 verkuerzt, macht sie [die CWE-348-Umstellung] zur ECHTEN
 * Voraussetzung — dann gilt Rechnung A, und dann ist die Umstellung blockierend."
 *
 * ⚠️ UND OB RECHNUNG A HEUTE GILT, IST UNBESTIMMT — ⬜ A-L12, und diese Datei setzt
 * KEINE der beiden Antworten voraus (Vorabscan-Fund F5,
 * `.superpowers/sdd/planteil3/VORABSCAN-A.md:218-228`; Auflage aus
 * `.superpowers/sdd/planteil3/briefs/KOPF.md:211-217`). Der Befund vom 2026-08-22 sagt
 * nein: auf einem Modul-Host bekommt jede Anfrage denselben Absenderschluessel
 * (`src/core/ratelimit.ts:98-111`). Der Umbau dagegen ist gebaut
 * (`src/core/routing.ts:59-61`). Die Abnahme am Server steht aus
 * (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:29-32` — P1 und P6
 * offen).
 *
 * ⛔ GENAU DESHALB TRAEGT DER CODERAUM DIE LAST: er ist die Mauer, die Schranke ist nur
 * die Notbremse. Wer diese Zahl senkt, senkt die einzige Massnahme, die nicht an A-L12
 * haengt.
 */
const KANONISCH = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/;

/**
 * Leert Kommentare inhaltlich, ohne die Zeilenzahl zu aendern.
 *
 * ⛔ ABGESCHRIEBEN UND NICHT IMPORTIERT: dieselbe Maschine steht als modul-lokale Funktion
 * in `src/app/m/radio/riegel.test.ts:181-201`. Ein Import von dort zoege deren
 * `describe`-Bloecke in diesen Lauf. Die 21 Zeilen (`:43-63`, gezaehlt) sind der kleinere
 * Preis; wer sie aendert, aendert beide Stellen.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

describe("radio-Code: das Alphabet", () => {
  it("enthaelt kein I, L, O, U", () => {
    /*
     * Crockford-Base32. Die vier Zeichen fehlen KONSTRUKTIV, nicht durch eine
     * Nachbehandlung: `I`/`l` sind in Base64url beide drin, Hex braeuchte einen viel
     * laengeren String. Das ist die Verwechslungsfestigkeit eines Codes, den jemand vom
     * gedruckten Aufsteller abtippt (Spec:2073-2081).
     */
    for (const z of ["I", "L", "O", "U"]) expect(CODE_ALPHABET).not.toContain(z);
  });

  it("hat genau 32 Zeichen, alle verschieden", () => {
    // 32 = 5 bit je Zeichen; 28 x 5 = 140 bit (Spec:2082-2087). Ein doppeltes Zeichen
    // senkte die Entropie STILL, ohne die Laenge zu aendern — und keine der uebrigen
    // Zusicherungen hier saehe es.
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
  });
});

describe("radio-Code: erzeugeCode", () => {
  it("liefert 28 Zeichen aus CODE_ALPHABET, in sieben Vierergruppen", () => {
    /*
     * 1.000 Laeufe, Spec:3080. Weniger faenge einen Alphabetfehler nur mit Glueck: bei
     * einem einzelnen falschen Zeichen im Vorrat liegt die Trefferwahrscheinlichkeit je
     * Zeichen bei 1/32, ueber 28 Zeichen also bei rund 59 % je Lauf — ein einzelner Lauf
     * liesse den Fehler in zwei von fuenf Faellen durch.
     */
    for (let i = 0; i < 1000; i++) {
      const c = erzeugeCode();
      expect(c).toMatch(KANONISCH);
      expect(c.replace(/-/g, "")).toHaveLength(28);
      for (const z of c.replace(/-/g, "")) expect(CODE_ALPHABET).toContain(z);
    }
  });

  it("liefert in 1.000 Laeufen keinen doppelten Code", () => {
    // Bei 140 bit ist eine Kollision in 1.000 Laeufen astronomisch unwahrscheinlich.
    // Dieser Fall faengt den einen realen Ausfall: ein fest verdrahteter oder aus einem
    // Zaehler abgeleiteter Code.
    const gesehen = new Set<string>();
    for (let i = 0; i < 1000; i++) gesehen.add(erzeugeCode());
    expect(gesehen.size).toBe(1000);
  });

  it("nennt den eingebauten Pseudo-Zufall nicht — Quelltext-Scan", () => {
    /*
     * ⛔ QUELLTEXT-SCAN UND KEIN VERHALTENSTEST, und das ist der Punkt: die
     * nicht-kryptografische Standardquelle erzeugt Codes mit der richtigen LAENGE und dem
     * richtigen ALPHABET. Jeder Verhaltensfall oben bliebe gruen. Sichtbar wird der Fehler
     * erst, wenn jemand die Ausgabe vorhersagt — also nie in einem Test (Spec:2089-2091).
     *
     * ⛔ DIE ZWEI HAELFTEN LESEN VERSCHIEDENE FASSUNGEN DERSELBEN DATEI, UND DAS IST DER
     * KERN DIESES FALLS.
     *
     *   NEGATIV (verbotener Name) → ROHER Quelltext, Kommentare eingeschlossen. `code.ts`
     *   darf den Namen auch in einem Kommentar nicht fuehren: ein „statt <jener Quelle>"
     *   waere die naechste Stufe der Aufweichung. Ein Scan darf falsch-positiv sein und
     *   laut, nie falsch-negativ und still (`riegel.test.ts:177-183`).
     *
     *   POSITIV (gebotener Aufruf) → Quelltext OHNE JEDEN KOMMENTAR, auch ohne den
     *   NACHGESTELLTEN, und der Aufruf muss statement-nah stehen (`(` verlangt). ⛔ ZWEIMAL
     *   GEMESSEN, NICHT VERMUTET (Funde F1 und N1, `.superpowers/sdd/planteil3/REVIEW-A2.md`,
     *   beide hier nachgefahren): `toMatch` auf dem ROHEN Text ohne `(` liess den
     *   Doc-Kommentar `code.ts:76-78` genuegen; `ohneKommentare` ALLEIN liess ein
     *   nachgestelltes `// frueher: <jener Aufruf>` genuegen. Beide Male blieb ein
     *   deterministischer Xorshift an `code.ts:96` unentdeckt — 19 bzw. 20 Faelle gruen.
     *
     * ⚠️ Ein Waechter, dessen Zusage weiter ist als seine Pruefung, bewacht nichts. WAS
     * DURCHKAEME, benannt statt verschwiegen: ein Literal `"getRandomValues("` ohne einen
     * Kommentarbeginn in derselben Zeile. Zeichenkettenliterale GANZ leert erst die Maschine
     * in `riegel.test.ts:203-231`; der Schnitt hier kappt nur ab dem ersten Kommentarbeginn.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/code.ts"), "utf8");
    expect(quelle, "erzeugeCode muss kryptografisch sein (Spec:2089)")
      .not.toMatch(/Math\s*\.\s*random/);
    expect(
      ohneKommentare(quelle).replace(/\/\/.*$/gm, ""),
      "die kryptografische Quelle muss AUFGERUFEN werden, nicht nur im Kommentar benannt",
    ).toMatch(/\b(?:getRandomValues|randomBytes|randomInt)\s*\(/);
  });

  it("verteilt gleichmaessig — kein Modulo-Bias ueber dem 32er-Alphabet", () => {
    /*
     * ⚠️ DIESER FALL IST DER GRUND, WARUM DIE ALPHABETLAENGE 32 UND NICHT 33 IST. Bei
     * einer Alphabetlaenge, die 256 nicht teilt, erzeugt `byte % laenge` einen Bias zu den
     * ersten Zeichen — der Coderaum SCHRUMPFT dann, ohne dass Laenge oder Alphabet sich
     * aendern, und keine der Zusicherungen oben saehe es. 32 teilt 256 genau achtmal.
     *
     * ⛔ DIE ZAHLEN HIER SIND EINE GROBE SCHRANKE, KEINE STATISTIK. 28.000 Zeichen ueber
     * 32 Symbole ergeben im Mittel 875 je Symbol; 500..1400 laesst reichlich Rauschen zu
     * und faellt trotzdem bei einem Bias, der eine Alphabethaelfte bevorzugt. Ein engerer
     * Rahmen machte den Test flatterhaft — die Fehlerform, die dazu fuehrt, dass jemand
     * ihn abschaltet.
     */
    const zaehler = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      for (const z of erzeugeCode().replace(/-/g, "")) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
    }
    expect(zaehler.size, "nicht alle 32 Zeichen kamen vor").toBe(32);
    for (const [z, n] of zaehler) {
      expect(n, `Zeichen ${z} kam ${n}-mal vor — Modulo-Bias?`).toBeGreaterThan(500);
      expect(n, `Zeichen ${z} kam ${n}-mal vor — Modulo-Bias?`).toBeLessThan(1400);
    }
  });
});

describe("radio-Code: normalisiereCode", () => {
  it("bildet I und L auf 1 und O auf 0 ab", () => {
    /*
     * Spec:2073-2081: `normalisiereCode` BILDET ZURUECK, statt zu verwerfen. Der Fall,
     * gegen den das steht, ist der abgetippte Code vom Ausdruck — jemand liest eine `1`
     * als `I`. Ein Verwerfen machte daraus „unbekannter Code"; ein Rueckbilden macht
     * daraus den richtigen.
     *
     * ⚠️ KLEINBUCHSTABEN SIND EINGESCHLOSSEN, WEIL `toUpperCase()` VOR DER SUCHE LAEUFT —
     * sonst bliebe `l` unbehandelt. Deshalb steht hier ein Fall mit `l`, nicht nur mit `L`.
     */
    expect(normalisiereCode("IIII-LLLL-OOOO-1111-0000-AAAA-BBBB"))
      .toBe("1111-1111-0000-1111-0000-AAAA-BBBB");
    expect(normalisiereCode("iiii-llll-oooo-1111-0000-aaaa-bbbb"))
      .toBe("1111-1111-0000-1111-0000-AAAA-BBBB");
  });

  it("setzt 28 Zeichen in sieben Vierergruppen", () => {
    /*
     * Der Bindestrich ist TEIL DES GESPEICHERTEN WERTS (Spec:2055-2059). Die
     * Gleichheitssuche im Schreibpfad (A6) vergleicht gegen die kanonische Form; ein ohne
     * Bindestriche eingegebener Code muss hier zu ihr werden, sonst findet die Suche nichts.
     */
    expect(normalisiereCode("A3F7K92MQRTV5X8YB6HN2DPZJ4KW"))
      .toBe("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW");
    expect(normalisiereCode("  a3f7 k92m/qrtv_5x8y.b6hn,2dpz;j4kw  "))
      .toBe("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW");
  });

  it("laesst eine abweichende Laenge unveraendert, statt sie zu gruppieren", () => {
    /*
     * Spec:2097: „bei GENAU 28 Zeichen in sieben Vierergruppen setzen, SONST
     * unveraendert zurueck." Wer stattdessen jede Laenge gruppiert, erzeugt aus einem
     * Tippfehler eine Zeichenkette, die AUSSIEHT wie ein Code.
     */
    expect(normalisiereCode("ABC")).toBe("ABC");
    expect(normalisiereCode("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4K"))
      .toBe("A3F7K92MQRTV5X8YB6HN2DPZJ4K");
  });

  it("laesst U stehen — der Filter ist weiter als das Alphabet", () => {
    /*
     * `[^0-9A-Z]` (`code.ts:146`) ist BEWUSST weiter als `CODE_ALPHABET`: er entfernt
     * Bindestriche, Leerzeichen und Trennzeichen jeder Art, laesst aber `U` stehen — ein
     * Zeichen, das im Alphabet gar nicht vorkommt (Spec:2062-2063). Damit ist die Breite
     * des Filters eine ENTSCHEIDUNG mit Waechter und keine Fussnote.
     *
     * ⛔ DIE ERSTE ZEILE IST DIE TRAGENDE. Verengt jemand den Filter „aufraeumend" auf
     * `[^0-9A-HJKMNP-TV-Z]`, faellt hier alles weg und die Funktion liefert den leeren
     * String. GEMESSEN (Fund F5, `.superpowers/sdd/planteil3/REVIEW-A2.md`): unter genau
     * dieser Verengung blieben die 19 Faelle des Vorgangs vollzaehlig gruen.
     *
     * ⚠️ DIE ZWEITE ZEILE IST EINE AUSSAGE, KEIN WAECHTER, und das steht hier, statt
     * verschwiegen zu werden: sie sagt A6 und A10 zu, dass das Ergebnis von
     * `normalisiereCode` eine SUCHANFRAGE ist und `istCodeForm` es verwerfen kann
     * (`code.ts:136-138`). Gegen die Verengung oben ist sie blind — dort liefe sie auf
     * `istCodeForm("")`, und das ist vorher wie nachher `false` (selbst gemessen).
     */
    const nurU = "UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU";
    expect(normalisiereCode(nurU)).toBe(nurU);
    expect(istCodeForm(nurU)).toBe(false);
  });

  it.each([
    ["leerer String", ""],
    ["nur Bindestriche", "---"],
    ["500 Zeichen", "x".repeat(500)],
    ["Emoji", "😀🚀"],
    ["Steuerzeichen", "A B"],
    ["Zeilenumbrueche", "A\nB\r\nC"],
    ["nur Trennzeichen", " \t \t "],
  ])("wirft nie: %s", (_name, roh) => {
    /*
     * Spec:2093-2098, woertlich: „WIRFT NIE (der Wert kommt aus einer URL oder einem
     * Formularfeld; ein Wurf machte aus einem Tippfehler einen 500 im Route Handler)."
     *
     * ⛔ DIESE TABELLE IST DIE EINZIGE ABSICHERUNG DER ZUSAGE. Der Route Handler in A10
     * ruft `normalisiereCode` mit dem rohen Pfadsegment — was dort ankommt, entscheidet
     * der Absender, nicht dieses Repo.
     */
    expect(() => normalisiereCode(roh)).not.toThrow();
    expect(typeof normalisiereCode(roh)).toBe("string");
  });
});

describe("radio-Code: istCodeForm", () => {
  it("nimmt die kanonische Form an und verwirft alles andere", () => {
    // Praedikat auf die KANONISCHE Form — also auf das ERGEBNIS von `normalisiereCode`,
    // nicht auf die Eingabe. Fuer die Formularvalidierung in Kapitel 5 (Spec:2101-2103).
    expect(istCodeForm("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW")).toBe(true);
    expect(istCodeForm("A3F7K92MQRTV5X8YB6HN2DPZJ4KW")).toBe(false);
    expect(istCodeForm("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KI")).toBe(false); // I ist kein Alphabetzeichen
    expect(istCodeForm("")).toBe(false);
    /*
     * ⛔ 28 ALPHABETZEICHEN, ABER DIE GRUPPEN SITZEN FALSCH — und das ist der einzige
     * Zeuge fuer `code.ts:167` (`return wert === gruppiere(ohneTrenner);`). Der Bindestrich
     * ist TEIL des gespeicherten Werts (Spec:2055-2059); ein Wert mit richtiger Laenge und
     * falschen Gruppen ist deshalb ein anderer Wert.
     *
     * GEMESSEN (Fund F4, `.superpowers/sdd/planteil3/REVIEW-A2.md`, hier nachgefahren):
     * weicht man `code.ts:167` zu `wert.length === gruppiere(ohneTrenner).length` auf,
     * blieben ohne diese Zeile alle 19 Faelle gruen — beide Ketten sind 34 Zeichen lang.
     * Der bindestrichlose Fall darueber faengt es NICHT: dort fallen schon die Laengen
     * auseinander (28 gegen 34), also greift der frueh abweisende Zweig `code.ts:165`.
     */
    expect(istCodeForm("A3F7-K92M-QRTV-5X8Y-B6HN-2DP-ZJ4KW")).toBe(false);
  });

  it("nimmt jeden erzeugten Code an — die Kopplung zwischen Erzeuger und Praedikat", () => {
    /*
     * ⛔ OHNE DIESEN FALL KOENNEN ERZEUGER UND PRAEDIKAT AUSEINANDERLAUFEN, und der
     * Schaden entstuende erst in der Verwaltung (Kapitel 5, Planteil 4): ein frisch
     * ausgestellter Code bestuende die Formularvalidierung nicht.
     */
    for (let i = 0; i < 200; i++) expect(istCodeForm(erzeugeCode())).toBe(true);
  });

  it("ist mit normalisiereCode gekoppelt", () => {
    // Der ganze Weg des abgetippten Codes: klein, ohne Bindestriche, wieder kanonisch.
    for (let i = 0; i < 200; i++) {
      const c = erzeugeCode();
      expect(istCodeForm(normalisiereCode(c.replace(/-/g, "").toLowerCase()))).toBe(true);
    }
  });
});
