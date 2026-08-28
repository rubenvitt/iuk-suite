// src/app/m/radio/_lib/quelltextScan.ts
/**
 * DIE DREITEILIGE BEREINIGUNG DER QUELLTEXT-SCANS DIESES MODULS — die EINE Fassung, aus der
 * `riegel.test.ts` und `admin/actions.test.ts` sie beziehen (Entscheidung **E-V13**,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:852-937`).
 *
 * ⛔ SIE IST KEINE BEQUEMLICHKEIT, SONDERN DIE BEHEBUNG EINES GEMESSENEN FEHLERS. Bis zum
 * 2026-08-23 kannte der Kommentarschnitt aller Scans dieses Moduls KEINE Regexliterale: ein
 * `/\//` traegt zwei Schraegstriche, der Schnitt hielt sie fuer einen Kommentarbeginn und
 * loeschte den Rest der Zeile. An einer NEGATIVEN Zusicherung (`toEqual([])`) heisst das:
 * weniger gefundene Verstoesse, STILL. Behoben in `6331e77` und `4ed3410`; die drei Teile
 * tragen nur ZUSAMMEN.
 *
 * ⛔ DIE REIHENFOLGE IST DER GANZE FUND, und sie steht in `bereinigt`:
 *   1. Zeichenketten leeren — sonst saehe ein `/` in `"a:/b"` wie ein Literalanfang aus,
 *   2. Regexliterale leeren — sonst haelt der Schnitt ihre zwei Schraegstriche fuer einen
 *      Kommentarbeginn,
 *   3. nachgestellte Kommentare schneiden, ZULETZT.
 *
 * ⛔ WARUM EIN MODUL UND KEINE DRITTE KOPIE: ein Import aus `riegel.test.ts` ist
 * ausgeschlossen — vitest laedt Testdateien nicht als Module fuereinander, und die Sonde zu
 * E-V13 hat den Schaden gemessen (`Test Files 2 passed (2)` · `Tests 3 passed (3)` statt 2,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:878-884`) — sie liefen ein zweites Mal.
 *
 * ⛔ EXPORTIERT WERDEN NUR `ohneKommentare` UND `bereinigt` (Vorabscan-Fund F7,
 * `.superpowers/sdd/planteil4/VORABSCAN.md:256-273`). `ohneKommentareUndZeichenketten` und
 * `ohneRegexLiterale` bleiben modul-privat, weil der Waechter, der ihren Direktaufruf
 * verbietet, ein ZAEHLER ist: er zaehlt die Nadel im Dateitext und kann einen Aufruf in einer
 * FREMDEN Datei nicht sehen. Ein nicht exportierter Name macht diesen Aufruf konstruktiv
 * unmoeglich — und `riegel.test.ts` sowie `admin/actions.test.ts` halten den Zaehler
 * zusaetzlich auf 0 fuer sich selbst.
 *
 * ⚠️ WAS DIESE DATEI AUSDRUECKLICH NICHT EINSAMMELT: die zwei bereits reparierten Kopien in
 * `_lib/bauform.test.ts` und `_actions/guards.test.ts` (`6331e77`, `4ed3410`). Ob die vier
 * Scans spaeter einer werden, ist ⬜ **V-L9** mit Eigentuemer ClickUp-Board
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „Offen, aber NICHT bau-blockierend") —
 * ⛔ kein Bauwert in diesem Fenster. Der Zaehlfall in `admin/actions.test.ts` haelt sie
 * solange SICHTBAR bewacht.
 *
 * ⛔ KEINE BAUFORM-DIREKTIVE. Diese Datei liegt unter `_lib/` und wird vom Direktiven-Scan
 * mitgezaehlt (`riegel.test.ts`, Block „keine Bauform-Direktive unter _lib/ und _db/"); weder
 * `"use client"` noch `"use server"` gehoeren hierher. Sie wird ausschliesslich von
 * Testdateien importiert und erreicht kein Browser-Bundle.
 */

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * ⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT. `_lib/zugang.ts`
 * schreibt „BEWUSST NICHT `isModuleAdmin`" und nennt `canAdminModule` beim Namen
 * (`_lib/zugang.ts:102`, `:114`) — genau die Saetze, die den Scan erklaeren, und sie duerfen
 * ihn nicht ausloesen (`riegel.test.ts`, Block „Pflicht 17", `riegel.test.ts:860-907`).
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
 */
export function ohneKommentare(quelle: string): string {
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

/**
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale geleert. Ein String
 * `"requireRadioAdmin("` erfuellte eine `toMatch`-Zusicherung sonst als reiner Text, OHNE
 * dass der Riegel je liefe (gemessen, Fund N1 aus
 * `.superpowers/sdd/planteil3/REVIEW-A2.md` uebertragen).
 *
 * ⛔ NACHGESTELLTE KOMMENTARE SCHNEIDET SIE SEIT DEM 2026-08-23 NICHT MEHR SELBST — der
 * Schnitt steht in `bereinigt`, HINTER dem Leeren der Regexliterale. Die Begruendung steht
 * dort (Fund M1); kurz: davor gelesen, haelt der Schnitt die zwei Schraegstriche eines
 * Regexliterals fuer einen Kommentarbeginn und loescht den Rest der Zeile.
 *
 * ⛔ UND NICHT „NUR FUER DIE POSITIVEN NACHWEISE NOETIG" — DAS STAND HIER BIS ZUM
 * 2026-08-23 UND WAR FALSCH (Fund M3, `.superpowers/sdd/planteil3/REVIEW-A2.md`). Ueber
 * `bereinigt` lesen die Klauseln (c), (e) und (f) NEGATIV, und (d) tut es ueber
 * `funktionsKoerper`. Dort ist jeder zusaetzliche Schnitt die STILLE Richtung: weniger Text
 * heisst weniger gefundene Verstoesse. Genau diese falsche Beschriftung war der Grund,
 * warum M1 nicht auffiel — die Rechtfertigung „ein Schnitt macht eine `toMatch`-Zusicherung
 * nur schwerer erfuellbar, nie leichter" gilt nur, wenn die Behauptung des Kopfes stimmt.
 *
 * ⚠️ `m/lagerbuch` haelt fuer sich die ANDERE Aufteilung fest und schreibt sie aus
 * (`src/app/m/lagerbuch/_lib/bauform.test.ts:164-176`, woertlich: „Die uebrigen Scans hier
 * sind alle NEGATIV (`toEqual([])`); dort macht ein Treffer in einem Zeichenkettenliteral
 * den Test hoechstens fälschlich ROT, nie still gruen, und bleibt deshalb bewusst
 * ungefiltert"). `m/radio` ist von dieser Aufteilung abgewichen — der Kopf hier war es
 * nicht.
 *
 * ⛔ NICHT EXPORTIERT (F7): wer sie direkt riefe, laese die Regexliterale wieder ungeleert.
 */
function ohneKommentareUndZeichenketten(quelle: string): string {
  const gekuerzt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < gekuerzt.length) {
    const z = gekuerzt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < gekuerzt.length && gekuerzt[i] !== z) {
        if (gekuerzt[i] === "\\") i++;
        else if (gekuerzt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < gekuerzt.length) { ergebnis += " "; i++; }
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis; // ⛔ DER SCHNITT auf nachgestellte Kommentare steht in `bereinigt` — dort
}

/**
 * ⛔ REGEXLITERALE WERDEN GELEERT, UND ZWAR VOR JEDER KLAMMERZAEHLUNG UND VOR JEDER
 * NEGATIVEN ZUSICHERUNG. Gemessen am 2026-08-23 (Fund M1,
 * `.superpowers/sdd/planteil3/REVIEW-A2.md`): die Funktion darueber leert Kommentare und
 * Zeichenketten, kennt aber KEIN Regexliteral. Ein `.split(/\//)` oder ein
 * `.replace(/\/\//g, …)` traegt zwei Schraegstriche nebeneinander — der Schnitt am Ende
 * jener Funktion haelt sie fuer einen Kommentarbeginn und LOESCHT DEN REST DER ZEILE.
 *
 * ⛔ AN DEN POSITIVEN ZUSICHERUNGEN IST DAS HARMLOS UND LAUT (weniger Text macht ein
 * `toMatch` schwerer erfuellbar, nie leichter). AN DEN NEGATIVEN IST ES STILL: dort heisst
 * weniger Text WENIGER GEFUNDENE VERSTOESSE. Eine unbalancierte Klammer im Literal —
 * `/^[A-Z(]+$/`, `/[}]/` — verschiebt zusaetzlich jeden Zaehler dahinter; ein verschobener
 * Funktionskoerper laesst BEIDE Richtungen eine andere Spanne pruefen als die gemeinte.
 *
 * ⚠️ UND DIE REIHENFOLGE IST DER GANZE FUND: die Funktion darueber schneidet nachgestellte
 * Kommentare seit dieser Runde NICHT mehr selbst; der Schnitt steht in `bereinigt`, hinter
 * dem Leeren der Literale. Zeichenketten muessen VOR den Regexliteralen geleert werden (ein
 * `/` in `"a:/b"` saehe sonst wie ein Literalanfang aus und der Scanner frasse bis zum
 * naechsten `/` — ueber ausfuehrbaren Code hinweg, still).
 *
 * Ein `/` beginnt ein Literal, wenn das letzte bedeutsame Zeichen davor keinen WERT
 * abschliesst (dann waere es eine Division). Die Liste unten ist die uebliche und bewusst
 * grosszuegig: wird ein Divisionszeichen faelschlich fuer einen Literalanfang gehalten,
 * verschwindet Quelltext aus der Sicht des Scans, und die naechste Behauptung darueber
 * schlaegt LAUT fehl — nie still.
 *
 * ⛔ NICHT EXPORTIERT (F7), aus demselben Grund wie die Funktion darueber.
 */
const REGEX_ERLAUBT =
  /(?:^|[([{,;:=!&|?+\-*%~^<>]|\breturn|\btypeof|\binstanceof|\bin|\bof|\bnew|\bdelete|\bvoid|\bcase|\bdo|\belse|\byield|\bawait)$/;

function ohneRegexLiterale(q: string): string {
  let ergebnis = "";
  let i = 0;
  while (i < q.length) {
    const z = q[i]!;
    // ⛔ `//` IST IMMER EIN KOMMENTARBEGINN, NIE EIN LITERAL — JS kennt kein leeres `//`.
    // Ohne diese Bedingung frisst der Scanner den Kommentarbeginn (`;` davor steht in
    // REGEX_ERLAUBT, das zweite `/` schliesst sofort), und der Schnitt in `bereinigt`
    // findet danach nichts mehr — der Kommentartext bliebe stehen und erfuellte jede
    // positive Zusicherung. GEMESSEN am 2026-08-23: ohne sie ist der Fall
    // "ein echter nachgestellter Kommentar wird weiterhin geschnitten" rot.
    if (z === "/" && q[i + 1] !== "/" && REGEX_ERLAUBT.test(ergebnis.trimEnd())) {
      let j = i + 1;
      let klasse = false;
      let fertig = false;
      while (j < q.length) {
        const y = q[j]!;
        if (y === "\\") { j += 2; continue; }
        if (y === "\n") break;
        if (y === "[") klasse = true;
        else if (y === "]") klasse = false;
        else if (y === "/" && !klasse) { fertig = true; break; }
        j++;
      }
      if (fertig) {
        ergebnis += " ".repeat(j + 1 - i);
        i = j + 1;
        while (i < q.length && /[a-z]/.test(q[i]!)) { ergebnis += " "; i++; }
        continue;
      }
    }
    ergebnis += z;
    i++;
  }
  return ergebnis;
}

/**
 * Die eine Bereinigung, die JEDER Scan benutzt: Kommentare, Zeichenketten UND Regexliterale
 * geleert, Zeilenzahl erhalten.
 *
 * ⛔ DER KOMMENTARSCHNITT STEHT HIER UND ZULETZT. Wer ihn nach vorn zieht, baut M1 neu.
 */
export function bereinigt(quelle: string): string {
  return ohneRegexLiterale(ohneKommentareUndZeichenketten(quelle)).replace(/\/\/.*$/gm, "");
}
