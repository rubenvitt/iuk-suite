// src/app/m/radio/_lib/bauform.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DER REIHENFOLGE-SCAN DER DREI GATE-FLAECHEN (Spec 1 §3.3.1, Zeilen 2256-2272; Testauftrag
 * §3.8 Zeile 3108). Bauform aus `src/app/m/lagerbuch/_lib/bauform.test.ts:1340-1517` —
 * 1:1 uebernommen sind `riegelFuer` und der Reihenfolge-Fall selbst; NICHT uebernommen ist
 * `einloeseAbschnitt` (Begruendung bei `scanAbschnitt`).
 *
 * ⛔ WARUM DER AUSSCHNITT UND NICHT DER GANZE DATEITEXT: `muster.exec(q)` liefert das ERSTE
 * Vorkommen in der ganzen Datei. Traegt eine Flaeche mehr als eine exportierte Funktion —
 * fuer `_actions/sitzung.ts` seit Entscheidung E12 der Normalfall —, koennten die vier
 * Erst-Vorkommen aus VERSCHIEDENEN Funktionen stammen. Die Reihenfolgeaussage waere dann
 * bedeutungslos, OHNE rot zu werden: ein `requireRadioHost(` frueh im Text „erfuellte" den
 * Host-Riegel fuer die einloesende Funktion mit.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT (⬜ A-L9).
 * Sie haelt fest, dass eine BAUFORM eingehalten ist — genau die Fehlerklasse, die
 * typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar ist.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");

/**
 * ⛔ DIE DREI FLAECHEN, DIE EINE AUSLEIH-SITZUNG AUSSTELLEN (Spec:2258: „Es gibt genau DREI
 * Stellen … ALLE DREI tragen dieselben sechs Schritte in derselben Reihenfolge"; Spec:3108
 * fuehrt genau diese drei Dateinamen). Die dritte, `_actions/sitzung.ts`, kommt aus
 * Planentscheidung E12 (`.superpowers/sdd/planteil3/briefs/KOPF.md:675-731`).
 */
const GATE_FLAECHEN = ["t/[code]/route.ts", "_actions/gate.ts", "_actions/sitzung.ts"];

/**
 * Die zwei AEUSSEREN Route Handler des Moduls (`riegel.test.ts:112`, `HANDLER_ANZAHL = 2`).
 * Sie tragen die Antwortform, die der Brief „verbindlich" nennt: 303 mit relativem
 * `Location`. ⛔ Sie sind nicht dieselbe Menge wie `GATE_FLAECHEN`: `abmelden/route.ts` loest
 * nichts ein, `_actions/*` antwortet nicht mit einem Status.
 *
 * ⛔ HIER STEHEN NUR DIE UMLEITENDEN HANDLER, und das ist eine Auflage an die Nachfolger:
 * `HANDLER_ANZAHL` waechst auf 3 (Planteil 4, `admin/(arbeit)/geraete/export/route.ts`) und 4
 * (Planteil 5, `sw.js/route.ts`) — `riegel.test.ts:83-84` fuehrt den Fahrplan. KEINER DER
 * BEIDEN GEHOERT IN DIESE LISTE: ein Export antwortet mit 200 und einem Rumpf, `sw.js`
 * ebenso. Wer sie hier eintraegt, macht den 303-Fall rot fuer richtigen Code. Diese Liste hat
 * bewusst keine Vollzaehligkeits-Zusicherung wie `GATE_FLAECHEN` (`toEqual(GATE_FLAECHEN)`) —
 * sie ist eine Auswahl nach Antwortform, keine Menge, die vollstaendig sein muss.
 */
const ROUTE_HANDLER = ["t/[code]/route.ts", "abmelden/route.ts"];

/**
 * ⛔ JE FLAECHE WIRD DER KOERPER EINER BENANNTEN FUNKTION GESCANNT, NICHT DER DATEITEXT.
 * `_actions/sitzung.ts` traegt ZWEI Exporte (E12), und `beenden` traegt nur den
 * Host-Riegel. Ein Scan ueber den Dateitext meldete fuer sie „Sperre fehlt ganz" — bei
 * RICHTIGER Implementierung. Fuer `_actions/gate.ts` und `t/[code]/route.ts` gilt derselbe
 * Grund aus dem Kopfkommentar oben.
 *
 * `funktionsKoerper(quelle, name)` ist aus `riegel.test.ts:205-220` kopiert.
 */
const EINLOESE_FUNKTION: Record<string, string> = {
  "t/[code]/route.ts": "GET",
  "_actions/gate.ts": "einloesenAmGate",
  "_actions/sitzung.ts": "erneuereSitzung",
};

/**
 * Der Host-Riegel ist je Flaeche VERSCHIEDEN, und das ist keine Bequemlichkeit: ein Muster,
 * das BEIDE Formen naehme, machte diesen Block fuer die zwei Actions blind — sie koennten
 * still auf die nicht-werfende Form umschwenken (eine Server Action, die auf fremdem Host
 * `null` bekommt und WEITERLAEUFT), ohne dass hier etwas rot wuerde
 * (`lagerbuch/_lib/bauform.test.ts:1358-1368`, dort gemessen).
 *
 * Route Handler nicht-werfend (`riegel.test.ts:442-451` verbietet dort die werfende Form),
 * Actions werfend (Spec:2360-2362, Bauform-Zulaessigkeitstafel Zeile 11).
 *
 * ⛔ KEINE VORGABE UND KEIN `??`-RUECKFALL: eine vierte Gate-Flaeche ist eine ENTSCHEIDUNG
 * und muss hier eingetragen werden. Ein Rueckfall liesse sie still in den falschen Zweig
 * laufen; ohne ihn wird `HOST_FORM[schluessel]!` zu `undefined` und der Fall bricht LAUT ab.
 */
const HOST_FORM: Record<string, RegExp> = {
  "t/[code]/route.ts": /\bradioHostOderNull\s*\(/,
  "_actions/gate.ts": /\brequireRadioHost\s*\(/,
  "_actions/sitzung.ts": /\brequireRadioHost\s*\(/,
};

/**
 * Die vier Riegel EINER Flaeche, in der zugesicherten Reihenfolge. Als Funktion und nicht
 * als Modulebenen-`const`, weil der Host-Riegel je Flaeche verschieden ist. An keinem der
 * Muster haengt ein `g` — ein gehisstes `/g`-Muster truege `lastIndex` zwischen den
 * Flaechen weiter (`lagerbuch/_lib/bauform.test.ts:1379-1382`).
 */
const riegelFuer = (schluessel: string): { name: string; muster: RegExp }[] => [
  { name: "Host", muster: HOST_FORM[schluessel]! },
  { name: "Sperre", muster: /\bgateGesperrt\s*\(/ },
  { name: "normalisieren", muster: /\bnormalisiereCode\s*\(/ },
  { name: "Einloesung", muster: /\bloeseCodeEin\s*\(/ },
];

/** Der rohe Quelltext einer Flaeche, ueber ihren modulrelativen Namen. */
const lies = (pfad: string): string => readFileSync(join(MODUL, pfad), "utf8");

/**
 * Der Ausschnitt, ueber den die vier Muster laufen — die EINE benannte Funktion je Flaeche,
 * nicht der Dateitext.
 *
 * ⛔ NICHT `einloeseAbschnitt` NENNEN: im Vorbild (`lagerbuch/_lib/bauform.test.ts:1437-1447`)
 * ist das die MITGLIEDSCHAFTSBEDINGUNG — `flaechen()` behaelt dort nur Dateien, in denen es
 * etwas findet. Hier ist der Ausschnitt eine FUNKTION JE FLAECHE (E12), und die
 * Mitgliedschaft entscheidet `vorhandeneFlaechen()` unten. Ein Name, zwei Aufgaben waere
 * genau die Verwechslung, die dieser Abschnitt vermeiden soll.
 *
 * ⚠️ HIER WIRD NICHT VORGEREINIGT, und das ist Absicht (Vorabscan-Fund F23):
 * `funktionsKoerper` beginnt selbst mit `bereinigt(quelle)` — die Kopie hier unten, und
 * seit Aufgabe B0 (2026-08-23) zeichengleich zu der in `riegel.test.ts`. Eine zweite
 * Anwendung waere idempotent und damit folgenlos — aber der naechste Leser entfernte die
 * falsche der beiden und machte den Scan still blind.
 */
const scanAbschnitt = (schluessel: string): string =>
  funktionsKoerper(lies(schluessel), EINLOESE_FUNKTION[schluessel]!);

/**
 * ⛔ DIE EXISTENZPFLICHT FILTERT AUF DIE DATEI, NICHT AUF „loest ein". Das Vorbild filtert
 * auf „traegt `redeemToken(`" (`lagerbuch/_lib/bauform.test.ts:1437-1447`), weil dort ALLE
 * drei Dateien einloesen. Hier waere derselbe Filter zweideutig: `sitzung.ts` loest zwar ein
 * (in `erneuereSitzung`, E12), aber die Aussage, die diese Liste tragen soll, ist „die drei
 * Dateien EXISTIEREN" — sonst sind die Faelle darunter vacuously true, sobald eine fehlt.
 * WELCHE Funktion gescannt wird, sagt `EINLOESE_FUNKTION`.
 */
const vorhandeneFlaechen = (): string[] =>
  GATE_FLAECHEN.filter((f) => existsSync(join(MODUL, f)));

/*
 * ⛔ HIER STEHEN DIE SECHS SCAN-HELFER — `quellDateien`, `trefferAuf`, `funktionsKoerper`
 * aus `riegel.test.ts:132-220`, dazu die dreiteilige Bereinigung, die mit Aufgabe V11 nach
 * `_lib/quelltextScan.ts:46-210` ausgezogen ist (E-V13) — mit ihren Kommentaren. ⚠️ SEIT AUFGABE
 * B0 (2026-08-23) WEICHT KEIN RUMPF MEHR AB: `ohneRegexLiterale` und `bereinigt` sind in
 * derselben Runde nachgezogen, in der `riegel.test.ts` sie bekam (Fund M1). Was bleibt, ist
 * die Signatur-Grenze von `funktionsKoerper` — sie ist dort unten ausgeschrieben und in
 * beiden Kopien gleich.
 *
 * ⛔ KEIN IMPORT AUS `riegel.test.ts`: vitest laedt Testdateien nicht als Module
 * fuereinander. ⚠️ DIE ZWEITE HAELFTE DER UEBLICHEN BEGRUENDUNG TRAEGT NICHT, und sie steht
 * hier trotzdem, statt verschwiegen zu werden (Vorabscan-Fund F22): eine geteilte
 * Helferdatei muesste NICHT unter `src/app/m/radio/` liegen — `riegel.test.ts:921` filtert
 * fuer den `"use client"`-Scan INNERHALB von `quellDateien()`, und das laeuft ausschliesslich
 * ueber `MODUL`. Ein Modul unter `src/core/testing/` waere fuer jeden Scan dieses Moduls
 * unsichtbar und ganz normal importierbar. Der Preis der Kopie ist benannt: `ohneKommentare`
 * steht damit viermal im Repo. Die Alternative ist in den Bericht zu A910 geschrieben, nicht
 * hier still verworfen.
 *
 * ⚠️ DER SCHNITT BEGINNT BEI `:113` UND NICHT BEI `:117` (Vorabscan-Fund F24, nachgemessen):
 * `:117` liegt MITTEN im Kommentarblock von `quellDateien`, das oeffnende `/**` steht bei
 * `:113`.
 *
 * ⛔ KEIN `.filter((p) => p !== SELBST)`: `quellDateien` verwirft bereits jede
 * `*.test.ts`/`*.spec.ts` — ein zweiter Filter waere ein TOTER PFAD und laese sich wie ein
 * zweiter Riegel (REVIEW-A8 S1, dort gemessen).
 */

/**
 * Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv, OHNE Testdateien.
 *
 * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit: diese Datei hier nennt
 * `AUSLEIH_COOKIE`, `NextResponse.redirect` und `cookies().delete` in ihren eigenen Mustern.
 * Ein Scan, der Testdateien mitliest, macht genau die Tests rot, die die Zusicherung TRAGEN
 * — und wird dann abgeschaltet statt repariert. Der Verlust ist klein und benannt: eine
 * Verletzung, die AUSSCHLIESSLICH in einer Testdatei steht, bleibt unentdeckt. Testdateien
 * werden nicht ausgeliefert.
 */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // erzeugtes SQL/JSON, kein TypeScript
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte damit
 * eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ
 * und still.
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

/**
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale geleert. Ein String
 * `"requireRadioHost("` erfuellte eine `toMatch`-Zusicherung sonst als reiner Text, OHNE
 * dass der Riegel je liefe (gemessen, Fund N1 aus
 * `.superpowers/sdd/planteil3/REVIEW-A2.md` uebertragen).
 *
 * ⛔ NACHGESTELLTE KOMMENTARE SCHNEIDET SIE SEIT AUFGABE B0 (2026-08-23) NICHT MEHR
 * SELBST — der Schnitt steht in `bereinigt`, HINTER dem Leeren der Regexliterale. Die
 * Begruendung steht dort (Fund M1); kurz: davor gelesen, haelt der Schnitt die zwei
 * Schraegstriche eines Regexliterals fuer einen Kommentarbeginn und loescht den Rest der
 * Zeile.
 *
 * ⛔ UND NICHT „NUR FUER DIE POSITIVEN NACHWEISE NOETIG" — DAS STAND HIER BIS ZUM
 * 2026-08-23 UND WAR FALSCH (Fund M3, `.superpowers/sdd/planteil3/REVIEW-A2.md`; in dieser
 * Kopie benannt von Commit `7ca9c53`, behoben in B0). Ueber `bereinigt` lesen die
 * Umleitungs-Klausel, die 303-Klausel und der `cookies().delete`-Scan NEGATIV, und der
 * Reihenfolge-Fall tut es ueber `funktionsKoerper`. Dort ist jeder zusaetzliche Schnitt die
 * STILLE Richtung: weniger Text heisst weniger gefundene Verstoesse.
 *
 * ⛔ DIE SONDE, DIE DAS BELEGT, IST EIN PAAR UND WURDE ZWEIMAL GEFAHREN (7ca9c53, und in
 * B0 vor der Reparatur nachgestellt): `Response.redirect("/x")` in `abmelden/route.ts`,
 * davor auf derselben Zeile ein `"a".split(/\//)` — `Tests 10 passed`, STILL GRUEN.
 * Dieselbe Zeile ohne das Regexliteral: `1 failed | 9 passed`. Nach der Reparatur ist die
 * Fassung MIT dem Regexliteral `1 failed | 12 passed`. Der letzte `describe`-Block dieser
 * Datei haelt beide Richtungen ohne Eingriff in den Baum fest.
 *
 * ⚠️ `m/lagerbuch` haelt fuer sich die ANDERE Aufteilung fest und schreibt sie aus
 * (`src/app/m/lagerbuch/_lib/bauform.test.ts:164-176`, woertlich: „Die uebrigen Scans hier
 * sind alle NEGATIV (`toEqual([])`); dort macht ein Treffer in einem Zeichenkettenliteral
 * den Test hoechstens fälschlich ROT, nie still gruen, und bleibt deshalb bewusst
 * ungefiltert"). `m/radio` ist von dieser Aufteilung abgewichen — der Kopf hier war es
 * nicht.
 */
function ohneKommentareUndZeichenketten(quelle: string): string {
  const bereinigt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < bereinigt.length) {
    const z = bereinigt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < bereinigt.length && bereinigt[i] !== z) {
        if (bereinigt[i] === "\\") i++;
        else if (bereinigt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < bereinigt.length) { ergebnis += " "; i++; }
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
 * `.superpowers/sdd/planteil3/REVIEW-A2.md`): `ohneKommentareUndZeichenketten` leert
 * Kommentare und Zeichenketten, kennt aber KEIN Regexliteral. Ein `.split(/\//)` oder ein
 * `.replace(/\/\//g, …)` traegt zwei Schraegstriche nebeneinander — der Schnitt am Ende
 * jener Funktion haelt sie fuer einen Kommentarbeginn und LOESCHT DEN REST DER ZEILE.
 *
 * ⛔ AN DEN POSITIVEN ZUSICHERUNGEN IST DAS HARMLOS UND LAUT (weniger Text macht ein
 * `toMatch` schwerer erfuellbar, nie leichter). AN DEN NEGATIVEN IST ES STILL: Klausel (c),
 * (e), (f) und (d) lesen ueber denselben Helfer, und dort heisst weniger Text WENIGER
 * GEFUNDENE VERSTOESSE. Eine unbalancierte Klammer im Literal — `/^[A-Z(]+$/`, `/[}]/` —
 * verschiebt zusaetzlich jeden Zaehler dahinter; `funktionsKoerper` zaehlt genau auf
 * diesem Text, und ein verschobener Koerper laesst BEIDE Richtungen eine andere Spanne
 * pruefen als die gemeinte.
 *
 * ⛔ AUS `riegel.test.ts` KOPIERT (Aufgabe B0, 2026-08-23), zeichengleich einschliesslich
 * der Bedingung `q[i + 1] !== "/"` unten — sie ist noetig, WEIL der Kommentarschnitt hier
 * seit B0 HINTER dem Leeren der Literale laeuft. KEIN IMPORT: vitest laedt Testdateien
 * nicht als Module fuereinander, und eine geteilte Helferdatei unter `src/app/m/radio/`
 * zaehlte der `"use client"`-Scan mit. Die Verdoppelung ist der Preis; sie ist im Kopf
 * dieser Datei bei den fuenf Scan-Helfern schon benannt.
 *
 * ⚠️ UND DIE REIHENFOLGE IST DER GANZE FUND: `ohneKommentareUndZeichenketten` schneidet
 * nachgestellte Kommentare seit dieser Runde NICHT mehr selbst; der Schnitt steht in
 * `bereinigt`, hinter dem Leeren der Literale. Zeichenketten muessen VOR den Regexliteralen
 * geleert werden (ein `/` in `"a:/b"` saehe sonst wie ein Literalanfang aus und der Scanner
 * frasse bis zum naechsten `/` — ueber ausfuehrbaren Code hinweg, still).
 *
 * Ein `/` beginnt ein Literal, wenn das letzte bedeutsame Zeichen davor keinen WERT
 * abschliesst (dann waere es eine Division). Die Liste unten ist die uebliche und bewusst
 * grosszuegig: wird ein Divisionszeichen faelschlich fuer einen Literalanfang gehalten,
 * verschwindet Quelltext aus der Sicht des Scans, und die naechste Behauptung darueber
 * schlaegt LAUT fehl — nie still.
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
 * Die eine Bereinigung, die JEDER Scan dieser Datei benutzt: Kommentare, Zeichenketten UND
 * Regexliterale geleert, Zeilenzahl erhalten. ⛔ KEIN SCAN RUFT
 * `ohneKommentareUndZeichenketten` DIREKT — sonst kehrt M1 an genau dieser Stelle zurueck.
 * Der letzte `describe`-Block dieser Datei haelt das als Zusicherung fest.
 */
function bereinigt(quelle: string): string {
  return ohneRegexLiterale(ohneKommentareUndZeichenketten(quelle)).replace(/\/\/.*$/gm, "");
}

function trefferAuf(muster: RegExp, dateien = quellDateien()): string[] {
  const funde: string[] = [];
  for (const pfad of dateien) {
    const zeilen = ohneKommentare(readFileSync(pfad, "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) funde.push(`${relative(process.cwd(), pfad)}:${i + 1}: ${zeile.trim()}`);
    });
  }
  return funde;
}

/**
 * Schneidet den KOERPER einer Funktion heraus — von ihrer Deklaration bis zur schliessenden
 * Klammer, ueber eine Klammerzaehlung.
 *
 * ⚠️ ⛔ DIE EINE FORM, DIE SIE NICHT TRIFFT, UND SIE IST FUER DIESEN PLANTEIL TRAGEND
 * (gemessen am 2026-08-23 mit einer Sonde ueber genau diese Kopie): der Schnitt beginnt an
 * der ERSTEN `{` NACH dem Funktionsnamen — nicht an der Rumpfklammer. Traegt die SIGNATUR
 * eine geschweifte Klammer, liest der Scan sie als Rumpf:
 *
 *   `function GET(req: Request, ctx: { params: Promise<{ code: string }> })`
 *      -> Koerper = "{ params: Promise<{ code: string }> }"   -> alle vier Riegel „fehlen"
 *   `function erneuereSitzung(c: string): Promise<{ ok: true } | { ok: false; … }>`
 *      -> Koerper = "{ ok: true }"                            -> dasselbe
 *
 * Beide Faelle sind NICHT leer und laufen deshalb an der Leer-Zusicherung im
 * Reihenfolge-Fall vorbei; sie melden „Riegel „Host" fehlt ganz" fuer eine sachlich
 * RICHTIGE Datei. ⛔ DIE BEHEBUNG GEHOERT IN DIE SIGNATUR, NICHT IN DIESE KOPIE: `route.ts`
 * fuehrt `RouteKontext` als benannten Typ, `sitzung.ts` `ErneuerungErgebnis`. Wer stattdessen
 * hier nachbessert, laesst diese Kopie und `riegel.test.ts:205-220` auseinanderlaufen.
 */
function funktionsKoerper(quelle: string, name: string): string {
  const q = bereinigt(quelle);
  const start = q.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const auf = q.indexOf("{", start);
  if (auf === -1) return "";
  let tiefe = 0;
  for (let i = auf; i < q.length; i++) {
    if (q[i] === "{") tiefe++;
    else if (q[i] === "}") {
      tiefe--;
      if (tiefe === 0) return q.slice(auf, i + 1);
    }
  }
  return "";
}

/** Jede Quelldatei unterhalb von `admin/` — die Trennlinie aus §3.6.3 Punkt 1. */
const adminDateien = (): string[] =>
  quellDateien().filter((p) => /\/admin\//.test(relative(process.cwd(), p).replace(/\\/g, "/")));

describe("radio-bauform: die drei Gate-Flaechen", () => {
  it("alle drei Gate-Flaechen existieren", () => {
    /*
     * ⛔ DIE VERSCHAERFUNG (Vorbild `lagerbuch/_lib/bauform.test.ts:1450-1457`). Ohne sie
     * sind die Faelle darunter „vacuously true", sobald eine Datei fehlt — und das sieht in
     * der Ausgabe wie ein bestandener Lauf aus. Verglichen wird eine aus der PLATTE gelesene
     * Liste gegen die Sollliste, IN DERSELBEN REIHENFOLGE.
     *
     * ⛔ DIESE ZEILE IST DER ZWEITE GRUND, WARUM A9 UND A10 EIN COMMIT SIND: ueber zwei von
     * drei Flaechen ist sie ROT.
     */
    expect(vorhandeneFlaechen()).toEqual(GATE_FLAECHEN);
  });

  it("jede Flaeche traegt alle vier Riegel — in dieser Reihenfolge", () => {
    /*
     * Spec:2256-2272. Die vier Riegel in der Reihenfolge Host -> Sperre -> normalisieren ->
     * Einloesung, gemessen an ihren TEXTPOSITIONEN im Funktionskoerper.
     *
     * ⛔ DIE LEER-ZUSICHERUNG STEHT VORNE UND MELDET FUER SICH (zeichengleich zu
     * `riegel.test.ts:574`, Vorabscan-Fund F8a). Ohne sie waere der Fall zwar nicht
     * leer-gruen — ein leerer Ausschnitt laesst alle vier `muster.exec` `null` liefern —,
     * aber die Meldung zeigte auf den FALSCHEN Fehler: „Riegel „Host" fehlt ganz", wo in
     * Wahrheit der Funktionsname nicht gefunden wurde.
     */
    const verstoesse: string[] = [];
    for (const schluessel of vorhandeneFlaechen()) {
      const abschnitt = scanAbschnitt(schluessel);
      if (abschnitt === "") {
        verstoesse.push(
          `${schluessel}: Funktionskoerper ${EINLOESE_FUNKTION[schluessel]!} nicht gefunden — der Scan waere hier blind`,
        );
        continue;
      }
      let vorher = -1;
      let vorherName = "(Abschnittsanfang)";
      for (const { name, muster } of riegelFuer(schluessel)) {
        const t = muster.exec(abschnitt);
        if (!t) { verstoesse.push(`${schluessel}: Riegel "${name}" fehlt ganz`); break; }
        if (t.index < vorher) { verstoesse.push(`${schluessel}: "${name}" steht VOR "${vorherName}"`); break; }
        vorher = t.index;
        vorherName = name;
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("kein Datenbankzugriff VOR der Sperre", () => {
    /*
     * ⛔ NACHGETRAGEN GEGEN DEN BRIEF (Vorabscan-Fund F8b): der Brief zitiert
     * `lagerbuch/_lib/bauform.test.ts:1370-1475`, dieser Fall steht dort bei `:1476` — also
     * knapp AUSSERHALB. Ohne ihn hat Eigenschaft 1 aus A3 keinen Waechter.
     *
     * `gateGesperrt` ist genau deshalb ohne Datenbankzugriff gebaut
     * (`_lib/gateSchranke.ts:165-169`, „UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT"):
     * sie SCHUETZT den Zugriff. Faellt ein `getDb()` davor, ist der Deckel wirkungslos — und
     * still. ⚠️ Der Reihenfolge-Fall oben faengt das NICHT: `getDb(` ist keiner seiner vier
     * Riegel.
     *
     * Fehlt `gateGesperrt(` im Abschnitt ganz, meldet das der Fall oben als „Riegel fehlt
     * ganz" — hier still weiterzugehen laesst also nichts durch.
     */
    const verstoesse: string[] = [];
    for (const schluessel of vorhandeneFlaechen()) {
      const abschnitt = scanAbschnitt(schluessel);
      const sperre = /\bgateGesperrt\s*\(/.exec(abschnitt);
      if (!sperre) continue;
      const db = /\bgetDb\s*\(/.exec(abschnitt);
      if (db && db.index < sperre.index) {
        verstoesse.push(`${schluessel}: getDb() steht vor gateGesperrt()`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("sitzung.ts hat ZWEI Exporte, und nur erneuereSitzung loest ein", () => {
    /*
     * ⛔ DIE ARBEITSTEILUNG INNERHALB EINER DATEI, und sie ist der Grund, warum der
     * Reihenfolge-Scan eine FUNKTION misst und nicht den Dateitext (E12).
     *
     *   erneuereSitzung — die dritte Gate-Flaeche (Spec:2258, :2563-2570). Alle vier Riegel,
     *                     in der Reihenfolge des Gates.
     *   beenden         — KEIN Code einzuloesen. Nur der Host-Riegel; die drei uebrigen
     *                     Muster gaebe es dort nicht, und ein Dateitext-Scan meldete sie
     *                     faelschlich als fehlend.
     */
    const q = bereinigt(lies("_actions/sitzung.ts"));
    expect(q).toMatch(/\bexport\s+async\s+function\s+beenden\s*\(/);
    expect(q).toMatch(/\bexport\s+async\s+function\s+erneuereSitzung\s*\(/);

    const beendenKoerper = funktionsKoerper(lies("_actions/sitzung.ts"), "beenden");
    expect(beendenKoerper, "beenden nicht gefunden — der Scan waere hier blind").not.toBe("");
    expect(beendenKoerper, "beenden traegt den Host-Riegel").toMatch(/\brequireRadioHost\s*\(/);
    expect(beendenKoerper, "beenden loest nichts ein").not.toMatch(/\bloeseCodeEin\s*\(/);

    const erneuernKoerper = funktionsKoerper(lies("_actions/sitzung.ts"), "erneuereSitzung");
    expect(erneuernKoerper, "erneuereSitzung nicht gefunden — der Scan waere hier blind").not.toBe("");
    expect(erneuernKoerper, "erneuereSitzung loest ein").toMatch(/\bloeseCodeEin\s*\(/);
    /*
     * ⛔ UND SIE LEITET NICHT UM. Das ist ihr ganzer Zweck: die Seite bleibt stehen, die
     * eingetragenen Werte bleiben stehen (Spec:2563-2567,
     * `lagerbuch/_actions/sitzung.ts:42-44`). Ein `redirect()` hier verwuerfe genau das,
     * wogegen die Funktion gebaut ist.
     */
    expect(erneuernKoerper, "erneuereSitzung darf nicht umleiten").not.toMatch(/\bredirect\s*\(/);
  });
});

describe("radio-bauform: die Zusagen, die kein Typ und kein Riegel halten kann", () => {
  it("keine Datei dieses Moduls nennt signOut", () => {
    /*
     * ⛔ Spec:2610-2614: „`/abmelden` raeumt AUSSCHLIESSLICH `AUSLEIH_COOKIE`. Kein
     * `signOut()`, kein Auth.js-Cookie — sonst verloere eine angemeldete Person ihre
     * Suite-Sitzung auf ALLEN Modul-Hosts beim Beenden des anonymen Zugangs."
     *
     * Der Fehler ist maximal naheliegend („abmelden heisst abmelden") und im Betrieb
     * unangenehm: wer ueber die Kachel kam und den Code-Zugang beendet, faende sich aus der
     * ganzen Suite ausgeloggt.
     *
     * ⛔ MODULWEIT, NICHT NUR ueber `abmelden/route.ts` (Fix-Runde 1 zu A910, Fund 3, im
     * Review gemessen): die zweite Stelle, an der derselbe Griff naheliegt, ist
     * `_actions/sitzung.ts#beenden` — der SICHTBARE Abmeldeknopf, und er heisst „Beenden".
     * Ein `await signOut()` dort war gegen die dateiweise Fassung dieses Falls unsichtbar
     * (18 Dateien, 243 Tests, 0 rot), obwohl der Schaden derselbe ist. Dieselbe Reichweite
     * hat der `cookies().delete`-Fall unten laengst.
     *
     * ⛔ ER LOEST SICH DABEI NICHT SELBST AUS, und das ist gemessen: `signOut` steht heute
     * ausserhalb der Testdateien genau zweimal im Modul — `_actions/sitzung.ts:164` und
     * `abmelden/route.ts:43` —, BEIDE in Blockkommentaren, und `trefferAuf` leert
     * Kommentare vor dem Vergleich. Testdateien verwirft `quellDateien()` ohnehin.
     */
    expect(trefferAuf(/\bsignOut\b/)).toEqual([]);
  });

  it("kein Rueckfalltext hinter gateMeldung", () => {
    /*
     * ⛔ Spec:2396-2398, woertlich: „**Kein Rueckfalltext.** `gateMeldung` gibt fuer einen
     * unbekannten Grund `null` zurueck, und die Flaeche zeigt dann KEINE Meldung. Ein ‚Etwas
     * ist schiefgelaufen' auf einer Seite, auf der nichts schiefgelaufen ist, ist schlechter
     * als Schweigen." Dazu Spec:2387: „Die Texte stehen an GENAU EINER Stelle."
     *
     * ⚠️ DIE FEHLERFORM, GEGEN DIE DIESER FALL GEBAUT IST, IST NICHT „ein Text zu viel",
     * sondern EIN ZWEITER ORT FUER DENSELBEN SATZ. `gateMeldung("zuviele", n)` kann fuer
     * einen Grund AUS dem Satz nie `null` liefern (`_lib/gateTexte.ts:111`
     * `if (!istGateGrund(roh)) return null;`, und `"zuviele"`/`"code"` stehen namentlich in
     * `GATE_GRUENDE`, `_lib/gateTexte.ts:37-42`) — der `??`-Zweig ist also TOT. Ein toter
     * Zweig faellt keinem Test auf; was auffiele, waere der Tag, an dem jemand `gateMeldung`
     * umbaut und die verkuerzte Doppelfassung ploetzlich AUSGELIEFERT wird. Genau das ist in
     * der ersten Fassung dieses Blocks passiert (Fix-Runde 1 zu A910, Fund 1): dort stand
     * `?? "Zu viele Fehlversuche."` neben dem echten Satz „Zu viele Fehlversuche. Bitte in
     * einer Minute erneut versuchen." Die richtige Form ist `gateMeldung(...)!`.
     *
     * ⛔ `trefferAuf` reinigt mit `ohneKommentare` — ZEICHENKETTEN BLEIBEN STEHEN, und nur
     * deshalb kann dieses Muster den Textliteral-Rueckfall ueberhaupt sehen. Mit
     * `ohneKommentareUndZeichenketten` waere der Fall dauerhaft leer-gruen.
     *
     * ⚠️ ES IST DIE LITERAL-FORM, DIE VERBOTEN IST, NICHT JEDES `??`. `_actions/gate.ts`
     * fuehrt `gateMeldung(...) ?? undefined` — dort ist das Feld `fehler?: string`, und
     * `undefined` ist KEIN Text, sondern der Typuebergang. Zwei Reichweiten wie beim
     * `cookies().delete`-Fall darunter: zeilenweise und dateiweit, weil `trefferAuf`
     * zeilenweise testet und ein Umbruch vor dem `??` sonst durchfiele.
     */
    const RUECKFALLTEXT = /gateMeldung\s*\([^)]*\)\s*(?:\?\?|\|\|)\s*["'`]/;
    expect(trefferAuf(RUECKFALLTEXT)).toEqual([]);

    const mehrzeilig: string[] = [];
    for (const pfad of quellDateien()) {
      if (RUECKFALLTEXT.test(ohneKommentare(readFileSync(pfad, "utf8")))) {
        mehrzeilig.push(relative(process.cwd(), pfad));
      }
    }
    expect(mehrzeilig, "Rueckfalltext hinter gateMeldung — auch ueber einen Zeilenumbruch hinweg").toEqual([]);
  });

  it("keine Datei unter admin/ nennt AUSLEIH_COOKIE", () => {
    /*
     * ⛔ Spec:2449-2451 und §3.6.3 Punkt 1 (Spec:2908-2912): das Cookie traegt `path: "/"`
     * (`_lib/ausleihSitzung.ts:207-219`) und wird damit an `/admin` MITGESCHICKT. Die
     * Zusage, dass es dort niemand LIEST, kann kein Typ und kein Riegel halten — nur dieser
     * Scan.
     *
     * ⚠️ HEUTE UEBER ZWEI DATEIEN (`admin/(arbeit)/layout.tsx`, `admin/(druck)/layout.tsx`).
     * Die Untergrenze steht dabei, damit er nicht leer-gruen wird, wenn `admin/` einmal
     * anders heisst.
     */
    const dateien = adminDateien();
    const kurz = dateien.map((p) => relative(MODUL, p).replace(/\\/g, "/")).sort();
    /*
     * ⛔ DIE NICHT-LEER-WACHE NENNT DIE ZWEI HUELLEN BEIM NAMEN (Fix-Runde 1 zu A910, Fund 6,
     * in der tragenden Haelfte uebernommen). Eine blosse Untergrenze ist bei 0 und 1 rot,
     * laesst aber offen, ob es die RICHTIGEN zwei Dateien sind: verschoebe jemand die zwei
     * Verwaltungs-Huellen und legte zwei andere Dateien unter `admin/` ab, bliebe der Fall
     * gruen und bewachte etwas anderes.
     *
     * ⛔ UND KEIN `toBe(2)` AUF DER LAENGE, anders als vom Review vorgeschlagen: Planteil 4
     * baut die zehn Seiten aus Spec:4369-4378 und einen Export-Handler unter `admin/` — eine
     * DRITTE Datei dort ist kein Fehler, sondern der Plan. `riegel.test.ts:97-100` faellt fuer
     * dieselbe Form dasselbe Urteil („eine DRITTE Verwaltungs-Huelle waere kein Fehler"). Was
     * exakt sein MUSS, ist die Zusicherung darunter — und die ist es: `toEqual([])`.
     */
    for (const pflicht of ["admin/(arbeit)/layout.tsx", "admin/(druck)/layout.tsx"]) {
      expect(kurz, `${pflicht} nicht im Scan — der Fall bewachte etwas anderes`).toContain(pflicht);
    }
    expect(trefferAuf(/\bAUSLEIH_COOKIE\b|radio_ausleihe/, dateien)).toEqual([]);
  });

  it("keine aeussere Flaeche baut eine absolute Umleitung", () => {
    /*
     * ⛔ Spec:2284-2296: `NextResponse.redirect(...)` verlangt eine ABSOLUTE URL, und
     * `req.url` traegt nach dem Modul-Host-Rewrite den INNEREN Pfad (`/m/radio/...`). Der
     * Browser landete also auf einer Adresse, die er nie gesehen hat — und bei `radio` ist
     * das teurer als bei `lagerbuch`, weil es KEIN PARALLELFENSTER gibt: der einzige
     * Rueckweg ist „Router zurueck".
     *
     * Ein RELATIVES `Location` loest der Browser gegen die URL auf, die ER sah
     * (RFC 7231 §7.1.2).
     *
     * ⚠️ DREI FORMEN DERSELBEN FEHLERKLASSE, NICHT EINE (Fix-Runde 1 zu A910, Fund 5, an
     * genau diesen Mustern nachgemessen):
     *
     *   `NextResponse.redirect(new URL(pfad, req.url))`                  — Muster 1
     *   `Response.redirect(new URL(pfad, req.url), 303)`                 — Muster 1
     *   `new NextResponse(null, { headers: { Location: new URL(…).toString() } })` — Muster 2
     *
     * ⛔ MUSTER 1 TRAEGT KEIN `\b` UND KEIN `(?:Next)?`, und beides ist gemessen (Fix-Runde 1
     * zu A910, Nachlauf): ein `\b` VOR `Response` greift in „NextResponse" NICHT (`t` und `R`
     * sind beide Wortzeichen) — `/\b(?:Next)?Response\./` liesse also `MyNextResponse.redirect`
     * durch, was das alte, anker-lose `/NextResponse\./` gefangen haette. Und ohne `\b` ist
     * `(?:Next)?` wirkungslos. Das nackte `Response\s*\.\s*redirect` ist ECHTE Obermenge von
     * beiden Vorgaengern; gemessen an fuenf Faellen, darunter `MyNextResponse.redirect(x)`.
     *
     * ⛔ KEIN VERBOT VON `new URL(… req.url …)` ALS SOLCHEM, und das ist gemessen: das im
     * Review vorgeschlagene `new\s+URL\s*\([^)]*\breq\.url\b` trifft
     * `abmelden/route.ts:71` — `new URL(req.url).searchParams.get("grund")` —, und das ist
     * die RICHTIGE Form, den `grund` zu lesen. Der Fall waere damit rot auf korrektem Code.
     * Muster 2 haengt deshalb am `Location`-Kopf und nicht an `new URL`. `[^,}]*` bindet es
     * an DIESE eine Objekt-Eigenschaft und laeuft dabei ueber Zeilenumbrueche.
     *
     * ⚠️ UND DAMIT IST SEINE GRENZE BENANNT, statt sie zu ueberzeichnen: EINE Indirektion
     * genuegt, um daran vorbeizukommen — `const ziel = new URL(pfad, req.url).toString();`
     * eine Zeile ueber `headers: { Location: ziel }` faellt durch, weil das `}` den Scan vor
     * dem `new URL` beendet. Gefangen ist die INLINE-Form, und die ist die naheliegende. Der
     * allgemeine Fall gehoert ⬜ A-L9 (ein echter Abruf auf zwei Hosts), nicht einem
     * Quelltext-Scan — dieselbe Ehrlichkeit wie bei `getDb(` als einzigem gescannten Opener
     * (Bedenken 4 des Berichts zu A910).
     *
     * ⛔ MUSTER 1 BLEIBT OHNE `\(`: ein `const um = NextResponse.redirect;` truege denselben
     * Fehler eine Zeile spaeter.
     */
    const ABSOLUTE_UMLEITUNG = /Response\s*\.\s*redirect/;
    const ABSOLUTES_LOCATION = /\bLocation\s*:[^,}]*\bnew\s+URL\s*\(/;
    for (const f of GATE_FLAECHEN.concat(["abmelden/route.ts"])) {
      const q = bereinigt(lies(f));
      expect(q, `${f} nennt Response.redirect — das verlangt eine ABSOLUTE URL`)
        .not.toMatch(ABSOLUTE_UMLEITUNG);
      expect(q, `${f} baut ein absolutes Location aus new URL(...)`)
        .not.toMatch(ABSOLUTES_LOCATION);
    }
  });

  it("die zwei Route Handler antworten mit 303", () => {
    /*
     * ⛔ NACHGETRAGEN IN FIX-RUNDE 1 ZU A910 (Fund 2). Der Brief nennt die Antwortform
     * „verbindlich" (`briefs/A910.md`, A10 Schritt 2: „303, nicht 302 — die Antwort auf ein
     * GET soll nach dem Folgen ein GET bleiben"), und bis hierher faerbte sich KEIN Test des
     * Moduls, wenn beide Handler auf 302 wechselten (im Review gemessen: 18 Dateien,
     * 243 Tests, 0 rot).
     *
     * WAS EIN 302 KOSTET: die Antwort auf ein GET, das eine Wirkung hatte, soll nach dem
     * Folgen ein GET bleiben. 303 sagt das ausdruecklich; bei 302 ueberlaesst man es dem
     * Browser. Der Fehler ist typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar —
     * genau die Klasse, fuer die es diese Datei gibt.
     *
     * ⛔ DIE ZWEITE HAELFTE IST DIE TRAGENDE. Ohne sie bliebe ein ZWEITER, falscher Zweig
     * unentdeckt: eine Datei, die an einer Stelle 303 und an einer anderen 302 antwortet,
     * erfuellt die erste Zusicherung. `30(?!3)\d` deckt jede 3xx-Umleitung ausser 303 ab —
     * auch 307 und 308, die ein „modernisierender" Griff naheliegend einsetzte — und kann
     * `status: 404` (die eigene 404 des Host-Riegels) nicht erreichen.
     */
    for (const f of ROUTE_HANDLER) {
      const q = bereinigt(lies(f));
      expect(q, `${f} antwortet nicht mit 303`).toMatch(/status:\s*303\b/);
      expect(q, `${f} traegt eine Umleitung, die nicht 303 ist`).not.toMatch(/status:\s*30(?!3)\d\b/);
    }
  });

  it("keine Datei dieses Moduls ruft cookies().delete", () => {
    /*
     * ⛔ Zwei Ausfaelle in einem (Bauform-Zulaessigkeitstafel Zeilen 3 und 4): in einer
     * Server Component WIRFT es (der vernarbte Praezedenzfall, mit Quellenbeleg in
     * `lagerbuch/abmelden/route.ts:12-20`), und ueberall sonst setzt es KEIN `Path` und
     * loescht dadurch am falschen Scope — WIRKUNGSLOS, ohne dass der Browser das meldet.
     *
     * Die eine erlaubte Form ist `ausleihCookieOptionen(0)`: dieselbe Optionen-Funktion wie
     * beim Setzen (Spec:2596-2604, `_lib/ausleihSitzung.ts:195-201`).
     *
     * ⛔ ZWEI SCANS, UND DER ZWEITE IST DIE BEHEBUNG VON VORABSCAN-FUND F21. `trefferAuf`
     * testet ZEILENWEISE (`riegel.test.ts:183-192`) — das `[\s\S]{0,40}` im ersten Muster
     * verspricht Mehrzeiligkeit, die es dort nicht bekommt: ein ueber zwei Zeilen
     * umbrochenes `(await cookies())\n  .delete(x)` faellt durch. Das waere
     * falsch-negativ UND still, die eine Richtung, die `_lib/quelltextScan.ts:58-59` woertlich
     * verbietet. Der zweite Scan wendet dasselbe Muster DATEIWEIT an und schliesst genau
     * diese Luecke. ⚠️ Kein dritter, schwaecherer Scan daneben — es geht um DENSELBEN Scan
     * in der richtigen Reichweite.
     */
    expect(trefferAuf(/\bcookies\s*\(\s*\)[\s\S]{0,40}\.\s*delete\s*\(/)).toEqual([]);

    const mehrzeilig: string[] = [];
    for (const pfad of quellDateien()) {
      const q = bereinigt(readFileSync(pfad, "utf8"));
      if (/\bcookies\s*\(\s*\)[\s\S]{0,40}\.\s*delete\s*\(/.test(q)) {
        mehrzeilig.push(relative(process.cwd(), pfad));
      }
    }
    expect(mehrzeilig, "cookies().delete( — auch ueber einen Zeilenumbruch hinweg").toEqual([]);
  });
});

describe("die Bereinigung selbst — der Waechter ueber dem Waechter", () => {
  /*
   * ⛔ DIESER BLOCK PRUEFT NICHT DAS MODUL, SONDERN DEN SCAN. Er ist das Gegenstueck zu
   * `riegel.test.ts:1002-1087` und steht hier, weil dieselbe Blindstelle (Fund M1,
   * `.superpowers/sdd/planteil3/REVIEW-A2.md`) in DIESER Kopie noch steckte, nachdem sie
   * dort behoben war — benannt von Commit `7ca9c53`, behoben in Aufgabe B0.
   *
   * ⛔ DIE QUELLEN UNTEN SIND SYNTHETISCH UND STEHEN ABSICHTLICH NICHT IM BAUM. Gemessen in
   * B0 (2026-08-23) ueber alle 28 Quelldateien des Moduls: der Schnitt auf nachgestellte
   * Kommentare greift an genau 8 Stellen, und alle 8 sind echte nachgestellte Kommentare —
   * kein einziges Regexliteral kollidiert heute. Ein Fall, der auf eine Datei des Moduls
   * zeigte, waere also leer-gruen und bewachte nichts. Die Blindstelle ist die
   * WAECHTERSTAERKE ab der naechsten Flaeche, nicht der Bestand.
   *
   * ⚠️ UND DESHALB FINDET DIE REPARATUR HEUTE KEINEN EINZIGEN NEUEN VERSTOSS — das ist
   * gemessen und steht hier, statt als Wirksamkeit ausgegeben zu werden. Der bereinigte Text
   * aendert sich in genau drei Dateien (`_lib/code.ts:144-146`, `_lib/grenzen.ts:122`,
   * `_lib/returnTo.ts:54`), und zwar ausschliesslich, weil dort jetzt Regexliterale geleert
   * sind; die Klammerbilanz jeder Datei bleibt gleich, und die vier von `funktionsKoerper`
   * geschnittenen Koerper (`t/[code]/route.ts#GET`, `_actions/gate.ts#einloesenAmGate`,
   * `_actions/sitzung.ts#erneuereSitzung`, `_actions/sitzung.ts#beenden`) sind
   * zeichengleich zu vorher. Der Nachweis, dass die Reparatur greift, sind die zwei Faelle
   * unten und das Sondenpaar am Baum — nicht eine gestiegene Fundzahl.
   */
  const SELBST = join(MODUL, "_lib/bauform.test.ts");

  const MIT_REGEX = [
    "export async function GET(req: Request) {",
    "  const teile = req.url.split(/\\//); return Response.redirect(teile[0]!);",
    "}",
  ].join("\n");

  it("ein Regexliteral mit zwei Schraegstrichen kappt den Rest der Zeile NICHT", () => {
    /*
     * DER ROTE FALL VON FUND M1, als Test statt als Sonde am Baum. `/\//` traegt zwei
     * Schraegstriche nebeneinander (das escapte `\/` und der schliessende Begrenzer); der
     * Schnitt `replace(/\/\/.*$/gm, "")` haelt sie fuer einen Kommentarbeginn und loescht
     * alles dahinter — hier die Umleitung selbst.
     *
     * ⛔ AN DER UMLEITUNGS-KLAUSEL, DER 303-KLAUSEL UND DEM `cookies().delete`-SCAN LIEST
     * DIESE DATEI NEGATIV. Dort heisst weniger Text WENIGER GEFUNDENE VERSTOESSE — der
     * Fall bliebe STILL gruen. Zweimal als Sondenpaar am Baum gemessen (7ca9c53 und in B0
     * vor der Reparatur nachgestellt): `Response.redirect("/x")` in `abmelden/route.ts`,
     * davor auf derselben Zeile ein `"a".split(/\//)` — `Tests 10 passed`. Dieselbe Zeile
     * ohne das Regexliteral: `1 failed | 9 passed`.
     */
    expect(bereinigt(MIT_REGEX), "das Regexliteral kappt die Umleitung dahinter")
      .toMatch(/Response\s*\.\s*redirect/);
  });

  it("ein echter nachgestellter Kommentar wird weiterhin geschnitten", () => {
    /*
     * DIE GEGENRICHTUNG, und sie gehoert unmittelbar daneben: ohne sie liesse sich der Fall
     * oben erfuellen, indem man den Schnitt ganz entfernt — dann erfuellte ein blosses
     * `// frueher: Response.redirect(ziel)` jede positive Zusicherung wieder, und die
     * negativen Klauseln wuerden auf einen Kommentar hin ROT statt auf Code hin.
     */
    const mitKommentar = "const antw = new NextResponse(null); // frueher: Response.redirect(ziel)\n";
    expect(bereinigt(mitKommentar), "der nachgestellte Kommentar steht noch da")
      .not.toMatch(/Response\s*\.\s*redirect/);
    expect(bereinigt(mitKommentar), "der ausfuehrbare Teil der Zeile wurde mitgeschnitten")
      .toMatch(/\bNextResponse\b/);
  });

  it("die Zeilenzahl bleibt erhalten — sonst luegen alle datei:zeile-Meldungen", () => {
    const roh = lies("abmelden/route.ts");
    expect(bereinigt(roh).split("\n").length).toBe(roh.split("\n").length);
  });

  it("kein Scan dieser Datei liest die ungeschuetzte Fassung direkt", () => {
    /*
     * ⛔ DER RIEGEL GEGEN DIE RUECKKEHR VON M1, uebernommen aus `riegel.test.ts:1054-1086`.
     * `ohneKommentareUndZeichenketten` darf genau zweimal vorkommen: in seiner eigenen
     * Deklaration und in `bereinigt`. Jede weitere Fundstelle ist ein Scan, der die
     * Regexliterale wieder ungeleert liest — und das faellt an einer negativen Zusicherung
     * niemandem auf.
     */
    // ⛔ UEBER `ohneKommentare` GELESEN, NICHT UEBER DEN ROHTEXT: eine blosse ERWAEHNUNG des
    // Namens in einem Kommentar dieser Datei waere sonst eine dritte Fundstelle, und der Fall
    // waere rot mit einer Meldung, die etwas anderes behauptet. Die Nadel ist zusammengesetzt,
    // weil das Literal selbst im gescannten Text steht.
    const nadel = "ohneKommentareUnd" + "Zeichenketten(";
    const stellen = ohneKommentare(readFileSync(SELBST, "utf8")).split(nadel).length - 1;
    expect(stellen, "ein Scan liest die ungeschuetzte Fassung direkt").toBe(2);
  });
});
