// src/app/m/radio/riegel.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DIE MODULWEITEN QUELLTEXT-ZUSICHERUNGEN (Spec 1 §1.6, Zeile 714).
 *
 * ⛔ ER IST DER NACHFOLGER DES ZWEITEN `describe`-BLOCKS AUS `_db/append.test.ts`
 * (Planteil 1, Aufgabe M4). Jener verbot JEDE Flaeche unter `src/app/m/radio/`, weil der
 * Host-Riegel noch nicht stand; er wird in Z6 GELOESCHT, nicht aufgeweicht. Diese Datei
 * ist die SCHAERFERE Fassung derselben Sorge: nicht mehr „keine Flaeche", sondern „jede
 * Flaeche traegt die Riegelform ihrer Art".
 *
 * ⛔ UND HIER STEHT, WIE WEIT „JEDE" REICHT — GEMESSEN, NICHT BEHAUPTET. Vorabscan-Fund
 * F2 (Mutationen M11 und M12) hat an der urspruenglichen Fassung dieser Datei gemessen:
 * eine `admin/(arbeit)/zugaenge/page.tsx` OHNE jeden Riegel lief `10 passed`, und eine
 * `admin/page.tsx` AUSSERHALB beider Route-Groups — also ohne Layout-Riegel ueber sich —
 * ebenfalls. Der geloeschte M4-Fall war der einzige Waechter, der `page.tsx` je genannt
 * hat. Deshalb traegt diese Datei eine Klausel (e). Abgedeckt sind:
 *
 *   (a) jedes `admin/**\/layout.tsx`   Existenzpflicht 2, pfadsensitiv
 *   (c) jedes `route.ts`               exakte Zahl, nicht-werfende Form
 *   (e) jedes `admin/**\/page.tsx`     exakte Zahl, dieselbe Pfadsensitivitaet wie (a)
 *   (d) zwei Funktionskoerper in `_lib/zugang.ts`
 *   (f) jede `page.tsx`/`layout.tsx` AUSSERHALB `admin/`  exakte Zahl, Form je Art
 *
 * ⬜ Z-L3 — WAS AUCH DANACH UNBEWACHT BLEIBT, und es steht hier, statt verschwiegen zu
 * werden: `page.tsx` UND `layout.tsx` AUSSERHALB von `admin/`. Beide Filter unten sind auf
 * `/admin/` verankert; `(ausleihe)/layout.tsx` (Planteil 3, Leitplan:89) faellt damit aus
 * Klausel (a) heraus — gemessen (Fund N6 der ersten Pruefung, REVIEW-Z56 Messung 4e):
 * ohne jeden Riegel `12 passed`. Das sind das Gate und die Ausleihflaechen (Planteil 3);
 * sie tragen bewusst KEINEN Verwaltungsriegel, sondern das
 * Zugangspraedikat der Ausleihe (`_lib/ausleihZugang.ts`,
 * `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:89`). Eine Klausel, die
 * beide Klassen in EINE Zahl zaehlte, maesse eine Zahl ohne Aussage. ⛔ PLANTEIL 3
 * SCHULDET DIE KLAUSEL ZU SEINEM EIGENEN RIEGEL; hier ist sie nicht vorwegzunehmen, weil
 * sie ueber einer heute leeren Menge leer-gruen waere — genau die Fehlerform, gegen die
 * die Untergrenzen unten stehen.
 * ⛔ GESCHLOSSEN IN PLANTEIL 3, AUFGABE A11, DURCH KLAUSEL (f). Die Messung oben (`12
 * passed` ohne jeden Riegel) BLEIBT STEHEN — sie ist der Beleg, warum die Klausel
 * existiert, und Sonde S-A11c ist ihre Gegenprobe an derselben Datei.
 *
 * SIE BELEGT NICHT, DASS ETWAS WIRKT, sondern dass eine BAUFORM eingehalten ist. Genau
 * dafuer ist sie die richtige Ebene — jede Zeile hier faengt einen Fehler, der typkorrekt,
 * lint-sauber und fuer `pnpm build` unsichtbar waere (Vorbild:
 * `lagerbuch/_lib/bauform.test.ts:6-11`, `src/core/shell/icons.test.ts`).
 *
 * ⚠️ WAS SIE AUSDRUECKLICH NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT.
 * Am Ende von Planteil 2 liegt unter den beiden Verwaltungs-Huellen KEINE `page.tsx`;
 * Next rendert sie also nicht. Ob das Layout einer Route-Group ohne Seite darunter
 * ueberhaupt ausgefuehrt wird, ist ⬜ Z-L1 und wird in Planteil 4 beim ersten echten
 * Abruf abgelesen. ⛔ Kein Fall in dieser Datei darf etwas anderes behaupten.
 *
 * ⚠️ ZWEI FORMEN, UND DER UNTERSCHIED IST TRAGEND (Vorbild `bauform.test.ts:13-37`):
 *
 *   EXISTENZPFLICHT — der Scan behauptet, dass es die Dateien GIBT, und nennt eine
 *   Untergrenze. Heute nur Klausel (a): ZWEI `admin/**\/layout.tsx` (Z6).
 *
 *   EIGENSCHAFTSFORM — der Scan toleriert, dass es die Dateien noch nicht gibt, und sagt
 *   nur etwas ueber die, die da sind. Heute Klausel (c) und (e): es gibt NULL Route
 *   Handler und NULL Verwaltungsseiten.
 *
 * ⛔ EINE KLAUSEL OHNE UNTERGRENZE UEBER EINER LEEREN MENGE IST LEER-GRUEN UND BEWACHT
 * NICHTS. Das ist dieselbe Fehlerklasse wie NT11 („ein Waechter, der `>= 5` statt `= 6`
 * prueft, bleibt gruen").
 *
 * ⛔ UND HIER GENUEGT DIE UNTERGRENZE NICHT — SIE WAERE SELBST DER FEHLER. `laenge >= 0`
 * ist fuer JEDE Liste wahr; es gaebe keine Mutation, die den Fall rot macht. Schlimmer
 * ist die Fortsetzung: mit `>=` bliebe der Waechter auch dann gruen, wenn Planteil 3 zwei
 * Handler baut und die Zahl hier stehen laesst — genau der Ausfall, den der Fahrplan
 * verhindern soll. DESHALB ZAEHLEN KLAUSEL (c) UND (e) EXAKT (`toBe`), und die Konstanten
 * heissen `HANDLER_ANZAHL` und `ADMIN_SEITEN_ANZAHL` und nicht `…_MINDESTENS`: bei `toBe`
 * waere „mindestens" eine Luege, und der naechste Leser „repariert" den Namen zurueck
 * auf `>=`.
 *
 * DER NAMENTLICHE ANHEBE-FAHRPLAN — eine Auflage an die Nachfolger, keine Notiz. Mit
 * `toBe` hat er jetzt einen TRAEGER: wer die Flaeche baut, bekommt den Fall rot und muss
 * die Zahl bewusst anheben.
 *
 *   Planteil 3 baut `t/[code]/route.ts` und `abmelden/route.ts`  -> ERLEDIGT (Planteil 3)
 *   Planteil 4 baut `admin/(arbeit)/geraete/export/route.ts`     -> HANDLER_ANZAHL = 3
 *   Planteil 5 baut `sw.js/route.ts`                             -> HANDLER_ANZAHL = 4
 *
 *   Planteil 3 baut `page.tsx` und den Ausleihzweig — beide AUSSERHALB von `admin/`,
 *                                                    -> ADMIN_SEITEN_ANZAHL bleibt 0
 *   Planteil 4 baut die zehn Seiten aus Spec:4369-4378
 *                                                    -> ADMIN_SEITEN_ANZAHL = 10
 *
 *   A11 baut `page.tsx` (das Gate)                   -> AUSLEIH_FLAECHEN_ANZAHL = 1
 *   A18 baut `(ausleihe)/layout.tsx` und
 *           `(ausleihe)/geraete/page.tsx`            -> AUSLEIH_FLAECHEN_ANZAHL = 3
 *   A19 baut `(ausleihe)/ausleihen/page.tsx`         -> AUSLEIH_FLAECHEN_ANZAHL = 4
 *   A20 baut `(ausleihe)/rueckgabe/page.tsx`         -> AUSLEIH_FLAECHEN_ANZAHL = 5
 *
 * ⚠️ Die Klausel (a) darunter bleibt bei `toBeGreaterThanOrEqual` — dort ist die
 * Untergrenze richtig: sie wird bei 0 oder 1 Layout rot, und eine DRITTE Verwaltungs-Huelle
 * waere kein Fehler. Der Einwand gilt genau der Handler- und der Seitenzahl, nicht dem
 * `>=` als solchem.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");
const SELBST = join(MODUL, "riegel.test.ts");

/**
 * ⛔ HEUTE ZWEI — EXAKT, nicht „mindestens". `t/[code]/route.ts` und `abmelden/route.ts`
 * (Planteil 3, Aufgabe A10); angehoben von Planteil 4 (3) und Planteil 5 (4). Die Konstante
 * steht hier oben und nicht im Testkoerper, damit die Aenderung EINE Zeile ist und im Diff
 * auffaellt.
 */
const HANDLER_ANZAHL = 2;

/**
 * ⛔ HEUTE NULL — EXAKT, aus demselben Grund wie `HANDLER_ANZAHL`. Planteil 3 laesst sie
 * bei 0 (sein Gate liegt auf `src/app/m/radio/page.tsx`, AUSSERHALB von `admin/`),
 * Planteil 4 hebt sie auf 10 (Spec:4369-4378: neun unter `(arbeit)`, eine unter
 * `(druck)`).
 */
const ADMIN_SEITEN_ANZAHL = 0;

/** Zwei Verwaltungs-Huellen: `admin/(arbeit)/layout.tsx` und `admin/(druck)/layout.tsx` (Z6). */
const ADMIN_LAYOUTS_MINDESTENS = 2;

/**
 * ⛔ HEUTE DREI: `page.tsx` (das Gate, A11), `(ausleihe)/layout.tsx` und
 * `(ausleihe)/geraete/page.tsx` (beide A18). Angehoben von A19 (4) und A20 (5). EXAKT,
 * nicht „mindestens" — dieselbe Begruendung wie bei `HANDLER_ANZAHL` oben.
 */
const AUSLEIH_FLAECHEN_ANZAHL = 3;

/**
 * Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv, OHNE Testdateien.
 *
 * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit
 * (`bauform.test.ts:100-117`): `zugang.test.ts` MUSS „auf isModuleAdmin umstellen" als
 * Mutation benennen duerfen, und diese Datei hier nennt jeden verbotenen Namen in ihren
 * eigenen Mustern. Ein Scan, der Testdateien mitliest, macht genau die Tests rot, die die
 * Zusicherung TRAGEN — und wird dann abgeschaltet statt repariert.
 *
 * Der Verlust ist klein und benannt: eine Verletzung, die AUSSCHLIESSLICH in einer
 * Testdatei steht, bleibt unentdeckt. Testdateien werden nicht ausgeliefert.
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
    if (pfad === SELBST) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/** Der modulrelative Pfad mit `/` als Trenner — die Form, auf die alle Muster zielen. */
function kurzPfad(pfad: string): string {
  return relative(process.cwd(), pfad).replace(/\\/g, "/");
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * ⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT. `_lib/zugang.ts`
 * schreibt in seinem Kopfkommentar „BEWUSST NICHT `isModuleAdmin`" und nennt
 * `canAdminModule` beim Namen — genau die Saetze, die den Scan erklaeren, und sie duerfen
 * ihn nicht ausloesen (`bauform.test.ts:124-141`).
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
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
 * ⛔ AUS `_actions/guards.test.ts` KOPIERT — wo dieselbe Fehlerklasse in der Fix-Runde 1
 * zu A910 schon einmal gemessen und behoben wurde — MIT GENAU EINER ABWEICHUNG, und die
 * steht hier statt in einer Behauptung: die Bedingung `q[i + 1] !== "/"` unten ist neu.
 * Jene Fassung braucht sie nicht, weil dort der Kommentarschnitt VOR dem Leeren der
 * Literale laeuft — genau die Reihenfolge, die hier M1 verursacht hat. KEIN IMPORT: vitest
 * laedt Testdateien nicht als Module fuereinander, und eine geteilte Helferdatei unter
 * `src/app/m/radio/` zaehlte der `"use client"`-Scan mit. Die Verdoppelung ist der Preis.
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
 * ⛔ WARUM DAS NOETIG IST UND EIN DATEIWEITES `not.toMatch` HIER FALSCH WAERE: Klausel (d)
 * sagt „`viewerOderNull` ruft `requireRadioHost` NICHT". Die DATEI `_lib/zugang.ts`
 * enthaelt `requireRadioHost` aber sehr wohl — als erste Anweisung von
 * `requireRadioAdmin` (Spec:670, Schicht iii). Ein `not.toMatch` ueber die ganze Datei
 * waere also entweder dauerhaft rot oder zwaenge dazu, die tragende Zeile zu entfernen.
 * Der Scan muss auf den FUNKTIONSKOERPER zielen.
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

/**
 * ⛔ DIE EINE STELLE, AN DER PLANTEIL 2 DIE ZWEITE RECHTESTUFE VORSIEHT
 * (Betreiberentscheidung C.6/B4, 2026-08-21) — und sie steht als HELFER da, nicht zweimal
 * abgeschrieben. Klausel (a) und Klausel (e) treffen dieselbe Unterscheidung; zwei Kopien
 * liefen auseinander, und die Fassung, die zuerst rot wuerde, waere die, die jemand
 * aufweicht.
 *
 *   admin/(arbeit)/**   -> requireRadioAdmin( ODER requireRadioVerwaltung(   Spec:4367,
 *                          Spec:4369-4375 (sieben Seiten auf der Verwaltungs-Stufe),
 *                          Spec:4376-4377 (zwei Seiten bleiben auf der Admin-Stufe)
 *   alles andere        -> requireRadioAdmin(                                Spec:4368,
 *                          Spec:4378 (`(druck)/zugaenge/blatt` — das Blatt mit den
 *                          ZUGANGSCODES IM KLARTEXT)
 *
 * WARUM NICHT „nur requireRadioAdmin", so wie es urspruenglich hier stand: Spec:4367
 * setzt `admin/(arbeit)/layout.tsx` verbindlich auf `requireRadioVerwaltung()`. Ein
 * Scan, der nur den ersten Namen kennt, waere gegen die verbindliche Bauform
 * ROT-BY-CONSTRUCTION, sobald Planteil 4 sie herstellt — zeichengleich die Fehlerform,
 * die B7 (Spec:96) an einem anderen Namen schon einmal abgeraeumt hat. Und der
 * naheliegende Gruen-Fix waere der schaedliche: das Layout zurueck auf
 * `requireRadioAdmin` — dann sperrt der LAYOUT-Riegel jede Updater-Person mit 404,
 * bevor irgendeine Seite laeuft, und typecheck, lint und build bleiben gruen.
 *
 * WARUM NICHT „oder" ueber ALLE Admin-Flaechen: das waere die offene Tuer, durch die
 * der Druckzweig auf die schwaechere Stufe rutschen koennte, ohne dass der Scan es
 * merkt. Die Aufteilung nach Group schliesst sie, ohne rot-by-construction zu sein.
 *
 * ⛔ Braucht ein Nachfolger eine DRITTE Group, ist das eine bewusste Aenderung AN DIESER
 * FUNKTION — kein vorgeoeffnetes Tor. Eine unbekannte Group faellt in den strengsten
 * Zweig.
 */
function personenRiegelFuer(kurz: string): { muster: RegExp; meldung: string } {
  return /\/admin\/\(arbeit\)\//.test(kurz)
    ? {
        muster: /\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/,
        meldung: "weder requireRadioAdmin( noch requireRadioVerwaltung( (Spec:4367/4376-4377)",
      }
    : {
        muster: /\brequireRadioAdmin\s*\(/,
        meldung: "kein requireRadioAdmin( — ausserhalb von (arbeit) gilt die Admin-Stufe (Spec:4368/4378)",
      };
}

/**
 * Liegt die Datei INNERHALB einer Route-Group (ein Segment in runden Klammern)? Nur dann
 * steht das Group-Layout mit seinem Host-Riegel ueber ihr. Eine Seite direkt unter
 * `admin/` oder in einem gewoehnlichen Unterverzeichnis hat KEIN solches Layout ueber
 * sich (M12 des Vorabscans ist genau dieser Fall) und muss den Host-Riegel deshalb selbst
 * nennen.
 */
function inRouteGroup(kurz: string): boolean {
  return /\/admin\/\([^)]*\)\//.test(kurz);
}

describe("(a) jede Verwaltungs-Huelle traegt BEIDE Riegel, in dieser Reihenfolge", () => {
  /*
   * ⛔ DER FILTER LAESST DAS ZWISCHENSEGMENT OPTIONAL — Vorabscan-Fund F1, gemessen (M5).
   * Die urspruengliche Fassung `/\/admin\/.*\/layout\.tsx$/` verlangte eines, und damit
   * fiel ein `src/app/m/radio/admin/layout.tsx` OHNE jeden Riegel aus der Liste heraus
   * statt in den strengen Zweig: `10 passed`. `src/app/m/radio/layout.tsx` faengt der
   * Filter weiterhin NICHT — die Datei traegt bewusst keinen Riegel (Spec §1.3), und ein
   * Treffer dort waere rot-by-construction.
   */
  const ADMIN_LAYOUTS = () =>
    quellDateien().filter((p) => /\/admin\/(?:.*\/)?layout\.tsx$/.test(kurzPfad(p)));

  it("es gibt mindestens zwei — sonst pruefte dieser Block null Zusicherungen", () => {
    /*
     * DIE EXISTENZPFLICHT. Ohne sie waere der Block ueber einer leeren Liste gruen und
     * bewachte nichts — dieselbe Fehlerklasse wie NT11. Heute sind es genau zwei:
     * `admin/(arbeit)/layout.tsx` (mit Rahmen) und `admin/(druck)/layout.tsx` (ohne),
     * Spec:429-441 und Spec:731.
     */
    expect(ADMIN_LAYOUTS().length, "leere Layoutliste — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(ADMIN_LAYOUTS_MINDESTENS);
  });

  it("jede nennt requireRadioHost UND den Personen-Riegel ihres Zweigs", () => {
    /*
     * Spec:429-441. ⚠️ DER DRUCK-ZWEIG IST NICHT WENIGER STRENG, SONDERN GLEICH STRENG —
     * nur die Huelle fehlt. Der Praezedenzfall steht im Repo und war ein echter Ausfall:
     * „Der Praezedenzfall `feedback` hat sie als eigene Route mit eigenem Layout — und
     * genau dort fiel sie aus dem Zugriffsriegel heraus, weil der Riegel im anderen
     * Layout hing" (zitiert in lagerbuch/verwaltung/(druck)/layout.tsx:30-34).
     *
     * Welcher Personen-Riegel je Zweig gilt und warum, steht bei `personenRiegelFuer`.
     * ⛔ EIN LAYOUT NENNT IMMER BEIDE — den Host-Riegel und den Personen-Riegel, in
     * dieser Reihenfolge.
     */
    const verstoesse: string[] = [];
    for (const pfad of ADMIN_LAYOUTS()) {
      const q = bereinigt(readFileSync(pfad, "utf8"));
      const kurz = kurzPfad(pfad);
      const person = personenRiegelFuer(kurz);

      if (!/\brequireRadioHost\s*\(/.test(q)) verstoesse.push(`${kurz}: kein requireRadioHost(`);
      if (!person.muster.test(q)) verstoesse.push(`${kurz}: ${person.meldung}`);
      // ERST DER HOST, DANN DIE PERSON (Spec:429-437): so verraet ein anonymer Aufruf auf
      // einem fremden Host die Verwaltungsroute nicht ueber einen vorgeschalteten
      // Login-Umweg. Die Reihenfolge ist eine Aussage, keine Formsache.
      const host = q.search(/\brequireRadioHost\s*\(/);
      const nachPerson = q.search(person.muster);
      if (host !== -1 && nachPerson !== -1 && host > nachPerson) {
        verstoesse.push(`${kurz}: der Personen-Riegel steht VOR requireRadioHost`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

/*
 * (b) ⛔ ENTFAELLT HIER — korrigiert in B14 (Spec:103, Kapiteltext Spec:714).
 *
 * Der `_actions/`-Scan liegt in `src/app/m/radio/_actions/guards.test.ts` (Kapitel 3
 * §3.8, Planteil 3). Jene Fassung ist die vollstaendigere — sie prueft JEDE EXPORTIERTE
 * ACTION, nicht nur die Datei — und sie fuehrt die AUSNAHMELISTE, ohne die der Scan auf
 * `gate.ts#einloesenAmGate` und `sitzung.ts#beenden` am ersten Tag rot waere. Der
 * naheliegende Gruen-Fix — dort einen Sitzungsriegel einsetzen — macht das Gate
 * unbenutzbar und sieht wie eine Verbesserung aus (§3.3.3).
 *
 * Zwei Scans ueber dieselbe Flaeche, von denen einer die Ausnahmen nicht kennt, sind ein
 * Scan zu viel. ⛔ Wer ihn hier nachtraegt, baut genau den Zustand, den B14 abgeraeumt hat.
 */

describe("(c) jeder Route Handler nimmt die NICHT-werfende Form", () => {
  const ROUTE_HANDLER = () => quellDateien().filter((p) => /\/route\.ts$/.test(kurzPfad(p)));

  it("die Handlerzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⚠️ HEUTE ZWEI, UND DAS IST EIN ZUSTAND, KEIN ZIEL. Planteil 2 baute keinen Route
     * Handler; Planteil 3 legt `t/[code]/route.ts` und `abmelden/route.ts` an.
     *
     * ⛔ `toBe`, NICHT `toBeGreaterThanOrEqual`. `laenge >= 0` ist fuer jede Liste wahr —
     * es gaebe KEINE Mutation, die diesen Fall rot macht, und der Fall waere genau die
     * NT11-Form, die der Kopf dieser Datei drei Absaetze weiter oben verurteilt. Mit `toBe`
     * wird er rot, sobald ein Nachfolger einen Handler baut und `HANDLER_ANZAHL` oben
     * stehen laesst — das ist der TRAEGER des Anhebe-Fahrplans, den ein Kommentar allein
     * nicht hat.
     */
    expect(
      ROUTE_HANDLER().length,
      "HANDLER_ANZAHL anheben — der Fahrplan steht im Kopf dieser Datei",
    ).toBe(HANDLER_ANZAHL);
  });

  it("keiner nennt die werfende Form, jeder nennt eine der beiden nicht-werfenden", () => {
    /*
     * Spec:714 Klausel (c), Spec:542-547. Route Handler bekommen `radioHostOderNull`
     * ODER `hostAbweisung`; Layouts, Seiten und Server Actions die werfende Form.
     *
     * ⚠️ DIE ZWEITE ALTERNATIVE IST NICHT OPTIONAL — sie ist der Grund, warum B13 diese
     * Klausel korrigiert hat. `sw.js/route.ts` (Planteil 5) ruft `hostAbweisung`, und die
     * alte Fassung ohne diese Alternative war gegen ihn rot, OBWOHL die Datei korrekt
     * geriegelt ist.
     *
     * Ein `notFound()` waere keine brauchbare Antwort auf einen GESCANNTEN QR-Code und
     * auch keine auf eine Service-Worker-Anfrage: es waere eine HTML-Fehlerseite mit
     * `Content-Type: text/html`, und der Browser meldete „manifest fetch failed" statt
     * eines sauberen 404. Route Handler haben ausserdem KEIN Layout ueber sich.
     *
     * ⛔ UND DIE DRITTE PRUEFUNG, SIE IST B11 (Spec:100, ausgeschrieben Spec:4379,
     * bestaetigt B17 Spec:117): EIN ROUTE HANDLER RUFT KEINEN WERFENDEN PERSONEN-RIEGEL.
     * Der Verwaltungs-Handler `admin/(arbeit)/geraete/export/route.ts` (Planteil 4)
     * riegelt mit `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())` und baut
     * seine 404 selbst. Ein werfender Riegel endet in `redirect('/login?…')` bzw.
     * `notFound()`; woertlich umgesetzt landete ein anonymer GET auf
     * `/admin/geraete/export` in einem LOGIN-UMWEG — typkorrekt, lint-sauber, und genau
     * das, was B11 abgeschafft hat.
     *
     * ⛔ UND SIE NENNT BEIDE WERFENDEN FORMEN, NICHT NUR EINE — Fund N3 der ersten
     * Pruefung (REVIEW-Z56), und die Luecke stammt aus genau diesem Commit. `Spec:4287`
     * fuehrt `requireRadioAdmin` UND `requireRadioVerwaltung` als die zwei werfenden
     * Riegel derselben Datei; seit Z5 kennt diese Testdatei den zweiten Namen ueberall
     * sonst (`personenRiegelFuer` in Klausel (a) und (e)), nur hier stand er nicht.
     * Gemessen (Fix-Runde 1, Sonde S1): derselbe Handler mit `requireRadioVerwaltung()`
     * statt `requireRadioAdmin()` lief `12 passed`. ⚠️ Und der falsche Griff ist der
     * naheliegende: der Handler aus Spec:4379 liegt unter `admin/(arbeit)/`, wo
     * Spec:4367/4369-4375 alles andere auf `requireRadioVerwaltung` setzt. Der Schaden
     * haengt hier NICHT an einer Reihenfolge und NICHT an einem inneren Backstop: eine
     * werfende Form ist im Antwortweg eines Route Handlers schlicht die falsche Gestalt.
     *
     * ⚠️ Ohne diese dritte Zeile bestuende ein Handler mit `radioHostOderNull(` UND einem
     * werfenden Riegel den Scan GRUEN. Sie war bis Planteil 2 ueber null Handlern
     * leer-gruen; seit Planteil 3 (`t/[code]/route.ts`, `abmelden/route.ts`) ist sie
     * SCHARF.
     */
    const verstoesse: string[] = [];
    for (const pfad of ROUTE_HANDLER()) {
      const q = bereinigt(readFileSync(pfad, "utf8"));
      const kurz = relative(process.cwd(), pfad);
      if (!/\bradioHostOderNull\s*\(|\bhostAbweisung\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: weder radioHostOderNull( noch hostAbweisung(`);
      }
      if (/\brequireRadioHost\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: nennt die werfende Form (Spec §1.4.3, Schicht ii)`);
      }
      if (/\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/.test(q)) {
        verstoesse.push(
          `${kurz}: nennt einen werfenden Personen-Riegel — Login-Umweg (B11, Spec:100/4379; beide Formen Spec:4287)`,
        );
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("(e) jede Verwaltungsseite traegt den Personen-Riegel ihrer Stufe", () => {
  /*
   * ⛔ DIESE KLAUSEL EXISTIERT WEGEN EINER MESSUNG, NICHT WEGEN EINER SORGE
   * (Vorabscan-Fund F2). Ohne sie deckte diese Datei `layout.tsx`, `route.ts` und zwei
   * Funktionskoerper ab — und `page.tsx` GAR NICHT, waehrend derselbe Commit den M4-Fall
   * loescht, der Seiten als einziger je genannt hat. Gemessen (M11/M12): eine
   * ungeriegelte `admin/(arbeit)/zugaenge/page.tsx` und eine ungeriegelte
   * `admin/page.tsx` liessen die Datei beide `10 passed`.
   *
   * ⛔ ENG AUF `admin/**` GEFASST, und das ist der tragende Zuschnitt: eine Klausel ueber
   * ALLE `page.tsx` des Moduls maesse eine Zahl ohne Aussage, weil die Ausleihflaechen
   * bewusst keinen Verwaltungsriegel tragen (⬜ Z-L3 im Kopf dieser Datei).
   */
  const ADMIN_SEITEN = () =>
    quellDateien().filter((p) => /\/admin\/(?:.*\/)?page\.tsx$/.test(kurzPfad(p)));

  it("die Seitenzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⚠️ HEUTE NULL, UND DAS IST EIN ZUSTAND, KEIN ZIEL — dieselbe Form und derselbe
     * Grund wie bei `HANDLER_ANZAHL`. Ohne diese Zeile waere der Fall darunter ueber der
     * leeren Menge leer-gruen, und der Nachfolger, der die erste Verwaltungsseite baut,
     * bekaeme kein Signal.
     */
    expect(
      ADMIN_SEITEN().length,
      "ADMIN_SEITEN_ANZAHL anheben — der Fahrplan steht im Kopf dieser Datei",
    ).toBe(ADMIN_SEITEN_ANZAHL);
  });

  it("jede nennt den Riegel ihrer Group, und ohne Group-Layout zusaetzlich den Host", () => {
    /*
     * ⛔ KEIN `requireRadioHost` FUER SEITEN INNERHALB EINER ROUTE-GROUP, und das ist
     * keine Nachlaessigkeit: Spec:4369-4378 gibt jeder der zehn Seiten GENAU EINE erste
     * Anweisung, den Personen-Riegel. Eine Klausel, die ihn auch von der Seite
     * verlangte, waere gegen die verbindliche Bauform rot-by-construction — dieselbe
     * Fehlerform wie bei B7.
     *
     * ⚠️ UND WER DEN HOST DANN HAELT, IST EINE ODER-AUSSAGE, NICHT DAS GROUP-LAYOUT
     * ALLEIN — Fund N2 der ersten Pruefung (REVIEW-Z56), und der Unterschied ist tragend.
     * `inRouteGroup` entscheidet allein an der PFADFORM; ob die Group ein `layout.tsx` hat,
     * prueft niemand (Klausel (a) fuehrt nur eine GLOBALE Untergrenze, keine je Group).
     * Gemessen (REVIEW-Z56 Messung 4c): eine `admin/(neu)/page.tsx` OHNE
     * `admin/(neu)/layout.tsx` lief `12 passed`. Dass daraus heute kein Loch wird, traegt
     * der ZWEITE Halter: `requireRadioAdmin` ruft `requireRadioHost(kopf)` als ERSTE
     * ANWEISUNG selbst (Spec:669-671), und Klausel (d) Fall 2 unten sichert genau das zu.
     * Der Host wird also ENTWEDER vom Group-Layout (Spec:4367-4368) ODER vom werfenden
     * Personen-Riegel selbst gehalten.
     * ⛔ AUFLAGE AN PLANTEIL 4: fuer `requireRadioVerwaltung` (Spec:4287) gilt diese
     * zweite Haelfte heute NICHT — Klausel (d) Fall 2 prueft ausschliesslich
     * `requireRadioAdmin`. Wer den zweiten werfenden Riegel baut, schuldet ihm dieselben
     * Koerper-Zusicherungen, sonst wird aus dieser ODER-Aussage ein echtes Loch.
     *
     * ⚠️ AUSSERHALB EINER ROUTE-GROUP KEHRT SICH DAS UM. Eine `admin/page.tsx` oder eine
     * `admin/irgendwas/page.tsx` hat KEIN Group-Layout ueber sich; sie muss den
     * Host-Riegel selbst nennen — UND IN DER RICHTIGEN REIHENFOLGE. Das ist der Fall M12
     * des Vorabscans — der einzige der drei gemessenen, der ausnutzbar war.
     *
     * ⛔ DIE REIHENFOLGEPRUEFUNG IST DIESELBE WIE IN KLAUSEL (a) — Fund N1 der ersten
     * Pruefung (REVIEW-Z56). Ohne sie sicherte diese Datei DIESELBE Zusage an zwei Stellen
     * UNGLEICH STRENG zu, und die schwaechere ist die, auf die sich ein Nachfolger beruft.
     * Gemessen (Fix-Runde 1, Sonde S2): eine `admin/page.tsx` mit dem Personen-Riegel VOR
     * `requireRadioHost` lief `12 passed`, waehrend derselbe Tausch in
     * `(druck)/layout.tsx` Klausel (a) rot faerbt (REVIEW-Z56 Messung 5). ⚠️ Sie laeuft
     * NUR im `!inRouteGroup`-Zweig: innerhalb einer Group gibt es keinen zweiten Aufruf,
     * dessen Stelle man vergleichen koennte, und ein Vergleich dort waere derselbe
     * rot-by-construction-Fehler wie oben.
     *
     * ⚠️ ZWEI LINIEN BLEIBEN PFLICHT (Spec:4382-4386): der Riegel im Layout UND der in
     * der Seite. Diese Klausel prueft die zweite Linie; Klausel (a) prueft die erste.
     * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (Spec:569-571).
     */
    const verstoesse: string[] = [];
    for (const pfad of ADMIN_SEITEN()) {
      const q = bereinigt(readFileSync(pfad, "utf8"));
      const kurz = kurzPfad(pfad);
      const person = personenRiegelFuer(kurz);

      if (!person.muster.test(q)) verstoesse.push(`${kurz}: ${person.meldung}`);
      if (!inRouteGroup(kurz)) {
        if (!/\brequireRadioHost\s*\(/.test(q)) {
          verstoesse.push(
            `${kurz}: ausserhalb jeder Route-Group und ohne requireRadioHost( — kein Layout haelt den Host`,
          );
        }
        // ERST DER HOST, DANN DIE PERSON (Spec:429-437) — zeichengleich zu Klausel (a).
        const host = q.search(/\brequireRadioHost\s*\(/);
        const nachPerson = q.search(person.muster);
        if (host !== -1 && nachPerson !== -1 && host > nachPerson) {
          verstoesse.push(`${kurz}: der Personen-Riegel steht VOR requireRadioHost`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("(d) die Gegenregel — viewerOderNull ruft den Host-Riegel NICHT", () => {
  it("der Koerper von viewerOderNull nennt requireRadioHost nicht", () => {
    /*
     * Spec §1.4.4 (Zeilen 595-607), Spec:714 Klausel (d), Spec:723.
     *
     * `viewerOderNull` ist die SICHTBARKEITSfrage — sie beantwortet „ist da jemand, und
     * darf er den /admin-Link sehen?". Ein Host-Riegel darin machte aus einer Frage eine
     * Sperre und schickte jeden anonymen Aufruf des Gates in einen 404.
     *
     * ⚠️ DER SCAN ZIELT AUF DEN FUNKTIONSKOERPER, NICHT AUF DIE DATEI. `_lib/zugang.ts`
     * ENTHAELT `requireRadioHost` — als erste Anweisung von `requireRadioAdmin`, und
     * genau dort MUSS es stehen (Schicht iii). Ein dateiweites `not.toMatch` waere
     * entweder dauerhaft rot oder zwaenge dazu, die tragende Zeile zu entfernen.
     */
    const quelle = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    const koerper = funktionsKoerper(quelle, "viewerOderNull");
    expect(koerper, "viewerOderNull nicht gefunden — der Scan waere leer-gruen").not.toBe("");
    expect(koerper, "Gegenregel §1.4.4: viewerOderNull ruft requireRadioHost NICHT")
      .not.toMatch(/\brequireRadioHost\b/);
  });

  it("requireRadioAdmin ruft ihn dagegen sehr wohl, und als ERSTE Anweisung", () => {
    /*
     * DIE GEGENPROBE ZUR GEGENREGEL, und sie gehoert unmittelbar daneben: ohne sie liesse
     * sich Klausel (d) erfuellen, indem man den Riegel aus BEIDEN Funktionen entfernt.
     * Server Actions haben kein Layout ueber sich (Spec:669-673, Kapitel-4-Pflicht 16).
     */
    const koerper = funktionsKoerper(
      readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8"),
      "requireRadioAdmin",
    );
    expect(koerper).not.toBe("");
    expect(koerper).toMatch(/\brequireRadioHost\s*\(/);
    /*
     * ⛔ UND DER GANZE KOERPER, NICHT NUR SEINE ERSTE ZEILE (REVIEW-Z4, Fund W2 — gemessen).
     * Bis hierher sicherte diese Klausel nur zu, dass `requireRadioHost(` VORKOMMT und VOR
     * `viewerAusSession(` steht. GEMESSEN (Messung 4 des Reviews, 2026-08-22): der ganze
     * Koerper durch `const viewer = viewerAusSession(await auth()); return viewer as
     * RadioViewer;` ersetzt liess `zugang.test.ts` mit `13 passed` durchlaufen — 0 rot.
     * Ausgerechnet die Zeile, die `_lib/zugang.ts` selbst „PFLICHT, NICHT KUER" nennt (die
     * Protokollzeile aus Spec:206-210), hatte damit in ganz Planteil 2 keinen Waechter.
     *
     * ⚠️ DAS IST EINE QUELLTEXT-ZUSICHERUNG, KEIN VERHALTENSNACHWEIS. Sie haelt fest, DASS
     * die vier tragenden Aufrufe im Koerper stehen — nicht, dass sie wirken. Die
     * VERHALTENSfaelle nach `lagerbuch`-Vorbild (`src/app/m/lagerbuch/_lib/zugang.test.ts:41`
     * Import, `:72` Aufruf, Begruendung `:60-71`) gehoeren an PLANTEIL 4, wo die erste
     * Verwaltungsseite steht und der Next-Anfragekontext echt ist.
     *
     * Warum genau diese vier: ohne `istRadioAdmin(` prueft der Riegel keine Gruppe, ohne
     * `notFound(` weist er nicht ab (403 waere die falsche Form, Spec:691-694), ohne
     * `meldeFehlendeGruppe(` ist Falle 23 unsichtbar (Spec:206-210, „die einzige Stelle, an
     * der dieser Zustand ueberhaupt sichtbar wird"), und ohne `redirect(` landet eine
     * ANONYME Person im 404 statt in der Anmeldung — `viewerAusSession` gibt dort `null`,
     * und `istRadioAdmin(null)` ist `false`.
     *
     * ⛔ AUFLAGE AN PLANTEIL 4, DAMIT DIESE VIER NICHT ROT-BY-CONSTRUCTION WERDEN: Spec:4287-4288
     * fuehrt `requireRadioAdmin` UND `requireRadioVerwaltung` in derselben Datei. Zwei werfende
     * Riegel mit fast gleichem Koerper sind der Lehrbuchfall, in dem jemand den gemeinsamen Teil
     * in einen Helfer zieht — und in dem Augenblick verlassen die vier Aufrufe den Koerper von
     * `requireRadioAdmin`, und diese Klausel faellt ueber KORREKTEM Code. Dann gilt: die vier
     * Zusicherungen WANDERN in den Koerper dieses Helfers (`funktionsKoerper(quelle, "<helfer>")`).
     * Sie werden NICHT geloescht und NICHT zu einem dateiweiten Scan aufgeweicht — ein
     * dateiweites `toMatch` waere ueber jeder Datei wahr, die die Namen irgendwo nennt, und das
     * ist genau die NT11-Form. (Dieselbe Richtung wie die `||`-Auflage in `_lib/zugang.ts`.)
     */
    expect(koerper, "ohne istRadioAdmin( prueft der Riegel keine Gruppe")
      .toMatch(/\bistRadioAdmin\s*\(/);
    expect(koerper, "ohne meldeFehlendeGruppe( ist Falle 23 unsichtbar (Spec:206-210)")
      .toMatch(/\bmeldeFehlendeGruppe\s*\(/);
    expect(koerper, "ohne notFound( weist der Riegel nicht ab (Spec:691-694)")
      .toMatch(/\bnotFound\s*\(/);
    expect(koerper, "ohne redirect( landet die anonyme Person im 404 statt in der Anmeldung")
      .toMatch(/\bredirect\s*\(/);
    const host = koerper.search(/\brequireRadioHost\s*\(/);
    const person = koerper.search(/\bviewerAusSession\s*\(/);
    expect(host, "erst der Host, dann die Person (Spec:669-671)").toBeLessThan(person);
  });
});

describe("(f) jede Ausleih-Flaeche traegt die Riegelform IHRER Art", () => {
  /*
   * ⛔ DIESE KLAUSEL SCHLIESST ⬜ Z-L3 (Kopf dieser Datei, Zeilen 28-42). Sie war dort
   * ausdruecklich NICHT vorwegzunehmen, weil sie ueber einer leeren Menge leer-gruen
   * gewesen waere. Mit Planteil 3 gibt es die Menge.
   *
   * ⛔ `src/app/m/radio/layout.tsx` IST AUSGENOMMEN, UND ZWAR NAMENTLICH. Die
   * Wurzel-Huelle traegt BEWUSST keinen Riegel (Spec §1.3): sie waere Vorfahr auch des
   * Ausleih-Zweigs, und ein Riegel dort schickte jeden anonymen Scan in einen 404. Ein
   * Filter „jede layout.tsx ausserhalb admin/" waere gegen die verbindliche Bauform
   * ROT-BY-CONSTRUCTION — dieselbe Fehlerform, die B7 (Spec:96) an einem anderen Namen
   * schon einmal abgeraeumt hat. (Klausel (a) faengt diese Datei aus demselben Grund
   * nicht; siehe `riegel.test.ts:436-438` — dort steht woertlich, dass Klausel (a)
   * `src/app/m/radio/layout.tsx` NICHT faengt und ein Treffer dort rot-by-construction
   * waere. `:420-429` ist nur `inRouteGroup`.)
   *
   * ⛔ ZWEI ARTEN, ZWEI FORMEN — und die NEGATIVE Haelfte traegt hier genauso wie die
   * positive:
   *
   *   das GATE (`page.tsx` direkt unter `m/radio/`, AUSSERHALB von `(ausleihe)`):
   *       requireRadioHost(   UND   ausleihZugangOderNull(
   *       ⛔ NICHT requireAusleihZugang( — die leitet bei fehlendem Cookie auf `/` um,
   *          und das IST diese Seite: ein ENDLOSER REDIRECT (Spec:2407-2409, §3.5.5
   *          Spec:2767).
   *       ⛔ UND NICHT requireRadioAdmin( / requireRadioVerwaltung( /
   *          requireAusleihSchreibend( — die Gate-Haelfte weist DIESELBEN Namen ab wie
   *          die Ausleih-Haelfte unten. Bis zur Fix-Runde 1 (REVIEW-A11, Fund W1) tat sie
   *          das nicht, und ein zusaetzliches `await requireRadioAdmin();` vor
   *          `viewerOderNull()` in `page.tsx` liess diese Datei mit `16 passed (16)`
   *          durch — selbst gemessen, ebenso mit `requireAusleihSchreibend(getDb())`.
   *          Ein WERFENDER Riegel schickte jeden anonymen Scan nach `/login`, bevor die
   *          Person das Gate je saehe (NS-Z6; die Begruendung steht ausgeschrieben in
   *          `page.tsx:119-123`); `requireAusleihSchreibend` wirft nicht, sondern gibt ein
   *          ERGEBNIS zurueck, das auf einer Flaeche niemand prueft — typkorrekt,
   *          lint-sauber, wirkungslos (Bauform-Zulaessigkeitstafel Zeile 10).
   *
   *   jede Flaeche UNTER `(ausleihe)/` (layout.tsx und page.tsx):
   *       requireAusleihZugang( — UND ZWAR ALS ERSTE ANWEISUNG DES RUMPFS (Fund 3)
   *       ⛔ NICHT requireRadioHost( — NS-Z1 und Pflicht 16
   *          (`docs/radio-portierung-analyse.md:973-977`): das Praedikat ruft ihn INTERN
   *          als erste Anweisung; ein zweiter Aufruf behauptet, es sei host-blind, und
   *          macht aus „hostgebunden durch Konstruktion" eine vergessliche Liste
   *          (Spec:2686-2691, §3.5.5 Spec:2768-2769).
   *       ⛔ UND NICHT requireAusleihSchreibend( — A18 HAT ENTSCHIEDEN UND SPIEGELT DIE
   *          GATE-HAELFTE (REVIEW-A11 W1). Gepruefte Grundlage, nicht vermutet: die Briefe
   *          A19 (`:10`, `:90`) und A20 (`:9`) fuehren fuer ihre Seiten ausschliesslich
   *          requireAusleihZugang(; der SCHREIBENDE Weg sind die Server Actions, und die
   *          fallen nicht in diese Klausel. Also kein ROT-BY-CONSTRUCTION.
   *
   * ⚠️ WAS SIE NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT (⬜ A-L9,
   * Erbe von Z-L1). Sie belegt, dass eine BAUFORM eingehalten ist.
   */
  const AUSLEIH_FLAECHEN = () =>
    quellDateien().filter((p) => {
      const kurz = kurzPfad(p);
      if (/\/admin\//.test(kurz)) return false;                       // (a)/(e) decken das ab
      if (kurz.endsWith("src/app/m/radio/layout.tsx")) return false;  // die Wurzel-Huelle, Spec §1.3
      /*
       * `template.tsx` und `default.tsx` rendern serverseitig FUER EINE ROUTE wie ein
       * Layout und gehoeren deshalb in denselben Filter. Heute gibt es unter `src/`
       * keine (gemessen in der Fix-Runde 1 zu A11: `find src -name 'template.tsx' -o
       * -name 'default.tsx'` liefert nichts) — ohne sie waere die Zusage „ab hier ist
       * keine Flaeche dieses Moduls mehr unbewacht" aber um zwei Dateinamen zu weit
       * (REVIEW-A11, Fund K3). ⚠️ Eine `src/app/m/radio/template.tsx` landete damit in
       * der GATE-Haelfte und machte sie rot: die erwartet GENAU EINE Wurzelflaeche.
       */
      return /\/(?:page|layout|template|default)\.tsx$/.test(kurz);
    });

  /**
   * Die ERSTE Anweisung im Rumpf der standard-exportierten Funktion, als getrimmte Zeile.
   *
   * ⛔ WARUM NICHT `funktionsKoerper` (`riegel.test.ts:360-375`): jener Helfer nimmt das
   * ERSTE `{` nach dem Funktionsnamen. Bei einem DESTRUKTURIERTEN Parameter ist das die
   * Parameterliste selbst — `GeraeteUebersichtPage({ searchParams }: …)` lieferte dort den
   * Rumpf des Parameterobjekts statt des Funktionsrumpfs, und der Scan verglicht still die
   * falsche Spanne. Diese Fassung zaehlt deshalb Klammern: der Rumpf beginnt am ersten `{`
   * auf Klammertiefe 0, NACHDEM die Parameterliste geschlossen ist.
   *
   * ⚠️ EINE BENANNTE GRENZE: eine Rueckgabetyp-Annotation mit geschweiften Klammern
   * (`: Promise<{ a: string }>`) traefe zu frueh. Heute traegt keine der Flaechen eine;
   * faellt das je an, faellt es LAUT — die Meldung unten druckt die gefundene Zeile aus.
   */
  function ersteAnweisungAus(q: string): string {
    const start = q.search(/\bexport\s+default\s+(?:async\s+)?function\b/);
    if (start === -1) return "";
    let tiefe = 0;
    let parameterGesehen = false;
    for (let i = start; i < q.length; i++) {
      const z = q[i];
      if (z === "(") { tiefe++; parameterGesehen = true; }
      else if (z === ")") tiefe--;
      else if (z === "{" && tiefe === 0 && parameterGesehen) {
        return q.slice(i + 1).split("\n").map((zeile) => zeile.trim()).find((zeile) => zeile !== "") ?? "";
      }
    }
    return "";
  }

  it("die Flaechenzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    expect(
      AUSLEIH_FLAECHEN().length,
      "AUSLEIH_FLAECHEN_ANZAHL anheben — der Fahrplan steht im Kopf dieser Datei",
    ).toBe(AUSLEIH_FLAECHEN_ANZAHL);
  });

  it("das Gate traegt Host UND Praedikat, und NICHT den umleitenden Riegel", () => {
    const gate = AUSLEIH_FLAECHEN().filter((p) => !/\/\(ausleihe\)\//.test(kurzPfad(p)));
    expect(gate.length, "das Gate fehlt — der Fall waere leer-gruen").toBe(1);
    const q = bereinigt(readFileSync(gate[0]!, "utf8"));
    expect(q, "kein requireRadioHost( auf dem Gate").toMatch(/\brequireRadioHost\s*\(/);
    expect(q, "kein ausleihZugangOderNull( — das Gate braucht das PRAEDIKAT (§3.5.5)")
      .toMatch(/\bausleihZugangOderNull\s*\(/);
    expect(q, "requireAusleihZugang( auf dem Gate ist ein ENDLOSER REDIRECT (Spec:2407-2409)")
      .not.toMatch(/\brequireAusleihZugang\s*\(/);
    // Die NEGATIVE Haelfte, symmetrisch zur Ausleih-Haelfte unten (Fix-Runde 1, W1).
    expect(q, "ein Verwaltungsriegel auf der einzigen anonymen Einstiegsflaeche (NS-Z6)")
      .not.toMatch(/\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/);
    expect(q, "requireAusleihSchreibend( gibt ein ERGEBNIS zurueck — auf einer Flaeche prueft es niemand")
      .not.toMatch(/\brequireAusleihSchreibend\s*\(/);
    // ERST DER HOST, DANN DAS PRAEDIKAT — zeichengleich zu Klausel (a) und (e).
    expect(q.search(/\brequireRadioHost\s*\(/))
      .toBeLessThan(q.search(/\bausleihZugangOderNull\s*\(/));
  });

  it("jede Flaeche unter (ausleihe)/ traegt requireAusleihZugang und NICHT den Host-Riegel", () => {
    const verstoesse: string[] = [];
    for (const pfad of AUSLEIH_FLAECHEN().filter((p) => /\/\(ausleihe\)\//.test(kurzPfad(p)))) {
      const kurz = kurzPfad(pfad);
      const q = bereinigt(readFileSync(pfad, "utf8"));
      if (!/\brequireAusleihZugang\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: kein requireAusleihZugang( (§3.5.5, Spec:2768-2769)`);
      }
      if (/\brequireRadioHost\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: ruft requireRadioHost( ein zweites Mal (NS-Z1, Pflicht 16)`);
      }
      if (/\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: ein Verwaltungsriegel auf der anonymen Ausleihflaeche`);
      }
      if (/\brequireAusleihSchreibend\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: requireAusleihSchreibend( gibt ein ERGEBNIS zurueck (Tafel Zeile 10)`);
      }
      /*
       * ⛔ DIE STELLUNG IST DIE ZUSICHERUNG, NICHT NUR DIE ANWESENHEIT (REVIEW-A18, Fund 3).
       * Bis zur Fix-Runde 1 zu A18 pruefte diese Haelfte nur, DASS der Riegel vorkommt.
       * Gemessen: `const zugang = await requireAusleihZugang(getDb());` HINTER
       * `const geraete = geraeteMitLeihstand(getDb());` zu schieben liess alle 435 Faelle des
       * Moduls gruen — die Seite las dann die Bestandstabelle einer Person, die keinen Zugang
       * hat, bevor sie abbrach. Die GATE-Haelfte oben fuehrt ihre Stellungspruefung seit A11
       * (`search(...)` gegen `toBeLessThan`); hier stand nichts Vergleichbares.
       *
       * ⛔ GEPRUEFT WIRD DIE ERSTE ANWEISUNG UND NICHT „vor dem ersten `await`": in
       * `geraete/page.tsx` ist `geraeteMitLeihstand(...)` SYNCHRON — der erste `await` bliebe
       * auch nach der Verschiebung der Riegelaufruf, und der Waechter waere still gruen. Das
       * ist eine benannte Abweichung vom Vorschlag des Reviews (Fund 3, zweite Variante).
       * ⛔ UND KEINE NAMENSLISTE der Lesefunktionen: die veraltete mit jeder neuen Abfrage,
       * genau die Fehlerform, die Fund 2 derselben Pruefung an einer Dateiliste gemessen hat.
       * Die Briefe A19 (`:10`) und A20 (`:9`) schreiben „erste Anweisung" woertlich fort.
       */
      const erste = ersteAnweisungAus(q);
      if (!/\brequireAusleihZugang\s*\(/.test(erste)) {
        verstoesse.push(
          `${kurz}: requireAusleihZugang( ist nicht die ERSTE Anweisung (§4.2.1) — dort steht: ${erste || "(kein Rumpf gefunden)"}`,
        );
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("Pflicht 17 — dieses Modul nimmt von der Suite-Admin-Abkuerzung Abstand", () => {
  it("findet keinen der vier core-Riegel", () => {
    /*
     * docs/radio-portierung-analyse.md:979-997. `isModuleAdmin`, `requireModuleAdmin`,
     * `moduleAdminPageOrNotFound` und `canAdminModule` sind fertig, gut und die FALSCHEN
     * fuer dieses Modul: alle vier tragen die Suite-Admin-Abkuerzung — `core/groups.ts:125`
     * steigt woertlich mit `if (groups.includes(suiteAdminGroup(env))) return true;` aus.
     * Ein Import saehe wie Wiederverwendung aus.
     *
     * `canAdminModule` ist der teuerste: es ist die hausuebliche SICHTBARKEITSfrage und
     * zeigte dem Suite-Admin einen Verwaltungs-Eintrag, dessen Ziel `requireRadioAdmin`
     * mit 404 beantwortet.
     *
     * ⚠️ DER KURZSCHLUSS SELBST WIRD SPAETER ENTFERNT — als eigene kleine Vorarbeit vor
     * Planteil 4 (KONTEXT-radio-planteil2.md:32-35). Dieser Scan bleibt trotzdem: er
     * sagt, dass `radio` seine Rechte SELBST aufloest, unabhaengig davon, was `core` tut.
     */
    expect(
      trefferAuf(/\b(?:isModuleAdmin|requireModuleAdmin|moduleAdminPageOrNotFound|canAdminModule)\b/),
      "Navigation UND Riegel lesen istRadioAdmin auf demselben Viewer (Pflicht 17)",
    ).toEqual([]);
  });

  it("findet keinen Treffer auf isAdmin", () => {
    /*
     * `isAdmin` heisst in der Suite „ist BETREIBER" (core/auth/config.ts:202-205), nicht „darf
     * radio verwalten". Ein 1:1-Port aus dem Alt-Bestand waere TYPKORREKT und liefe durch
     * `pnpm build` — und BEIDE Dev-Logins der Suite setzen `isAdmin = true`. Die E2E
     * blieben also gruen, waehrend die gesamte Radio-Verwaltung fuer jeden Suite-Betreiber
     * offen stuende (Vorbild `lagerbuch/_lib/bauform.test.ts:211-227`).
     *
     * Hinter /admin liegen Klarnamen samt Bewegungshistorie und die Enrollment-Codes.
     */
    expect(trefferAuf(/\bisAdmin\b/), "session.user.isAdmin ist fuer dieses Modul verboten (Entscheidung 9)")
      .toEqual([]);
  });

  it("liest die Admin-Gruppe ueber adminGroupsFor, nie ueber das Registry-Feld", () => {
    /*
     * `mod.adminGroups` direkt gelesen macht SUITE_ADMIN_GROUP_RADIO an genau dieser
     * Stelle wirkungslos, und der Fehler ist still: eine Instanz mit anders benannten
     * SSO-Gruppen liefe mit einem Riegel, der niemanden durchlaesst (registry.ts:29-35
     * schreibt dieselbe Falle fuer prodHosts aus).
     */
    expect(trefferAuf(/\.adminGroups\b/), "adminGroupsFor(mod) statt mod.adminGroups (Pflicht 17)")
      .toEqual([]);
  });
});

describe('keine Bauform-Direktive unter _lib/ und _db/', () => {
  it("findet keine Direktive", () => {
    /*
     * Falle 6 (`CLAUDE.md`): ein WERT aus einem `"use client"`-Modul kommt in einer Server
     * Component nicht an — sie bekommt eine Client-Referenz statt des Wertes, HTTP 500 fuer
     * die ganze Seite. TypeScript ist zufrieden, `build` findet nichts, und VITEST KANN ES
     * STRUKTURELL NICHT FINDEN (dort ist `"use client"` ein wirkungsloser String). Genau
     * deshalb steht hier ein Quelltext-Scan und kein Verhaltenstest.
     *
     * `_lib/host.ts` wird von Server Components UND Route Handlern gelesen (Spec:455-456);
     * `_lib/zugang.ts` von Layouts und Server Actions.
     */
    const dateien = quellDateien().filter((p) => /\/(?:_lib|_db)\//.test(kurzPfad(p)));
    expect(dateien.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(4);
    expect(
      trefferAuf(/^\s*["']use client["']/, dateien),
      'Werte fuer Server Components gehoeren in ein Modul OHNE "use client" (Falle 6)',
    ).toEqual([]);
  });

  it('findet auch keine Direktive "use server"', () => {
    /*
     * ⬜ A-L16 GESCHLOSSEN. Der Posten steht im Ledger
     * (`.superpowers/sdd/planteil3/progress.md`, Block „Offen, nachgetragen in der
     * Fix-Runde 2 zu A14") und benennt als Eigentuemer ausdruecklich „die naechste Aufgabe,
     * die `riegel.test.ts` ohnehin waechst — dort ist der Ankerdurchgang schon geschuldet
     * und die Zusicherung kostet nur noch ihre eigenen Zeilen". Das ist A18: die Aufgabe
     * hebt `AUSLEIH_FLAECHEN_ANZAHL` und spiegelt die Verbotsliste in Klausel (f).
     *
     * ⛔ WAS ER FAENGT, UND WARUM DIE GEGENRICHTUNG NICHT GENUEGT: eine `"use server"`-Datei
     * ist ein Modulgrenzfall, der ausschliesslich asynchrone Funktionen exportieren darf.
     * `_actions/guards.test.ts:699-716` VERLANGT die Direktive als erste Zeile jeder Datei
     * unter `_actions/` — das ist die andere Richtung auf einem anderen Ordner und sagt
     * ueber `_lib/` und `_db/` nichts. Genau dort liegen aber die WERTE, die Server
     * Components lesen (`GATE_GRUENDE`, `STATUS_HEX`, `AUSLEIH_GRUENDE`, `STATUS_FILTER`);
     * eine Direktive dort machte aus jedem von ihnen eine Serverreferenz.
     *
     * ⚠️ BEWACHT WAR BIS HIERHER GENAU EINE DATEI, und das ist gemessen: `_lib/meldungen.ts`
     * scannt sich selbst (`_lib/meldungen.test.ts:530-555`, Sonden M-G und M-L je 1 rot).
     * Jede andere Datei unter `_lib/` und `_db/` durfte die Direktive tragen, ohne dass ein
     * Tor rot wurde.
     *
     * ⚠️ WAS ER NICHT FAENGT: eine Direktive, die nicht am Zeilenanfang steht. Dieselbe
     * Grenze wie beim `"use client"`-Scan darueber, und dieselbe Antwort — die Direktive
     * WIRKT nur als erste Anweisung der Datei.
     */
    const dateien = quellDateien().filter((p) => /\/(?:_lib|_db)\//.test(kurzPfad(p)));
    expect(dateien.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(4);
    expect(
      trefferAuf(/^\s*["']use server["']/, dateien),
      '"use server" gehoert unter _actions/ — dort setzt guards.test.ts die Gegenrichtung durch',
    ).toEqual([]);
  });
});

describe("kein eingebauter Pseudo-Zufall in diesem Modul", () => {
  it("findet keinen Aufruf der nicht-kryptografischen Standardquelle", () => {
    /*
     * ⛔ `KOPF.md:295` fuehrt diesen Namen in der Tafel (Ueberschrift `:281`) „Verbotene Namen und Muster
     * (modulweit, VON `riegel.test.ts` DURCHGESETZT)" — und bis zur Fix-Runde zu A2 stand
     * er dort ohne Durchsetzung: `grep -n "random"` auf diese Datei lieferte keinen
     * Treffer, der einzige Waechter war `_lib/code.test.ts` und der galt nur fuer EINE
     * Datei (Fund F3, `.superpowers/sdd/planteil3/REVIEW-A2.md`). Fiele der aus, haette
     * das Modul gegen vorhersagbare Codes gar nichts. A6, A8, A9 und A10 legen weitere
     * Dateien an; diese Klausel deckt sie ab dem ersten Tag.
     *
     * Der Schaden ist der aus Spec:2089-2091: die Standardquelle liefert Codes mit der
     * richtigen LAENGE und dem richtigen ALPHABET. Jeder Verhaltenstest bliebe gruen —
     * sichtbar wird der Fehler erst, wenn jemand die Ausgabe vorhersagt.
     *
     * ⚠️ DIESE KLAUSEL IST SCHWAECHER ALS DER SCAN IN `_lib/code.test.ts`, und das steht
     * hier, statt verschwiegen zu werden: `trefferAuf` liest ueber `ohneKommentare`, prueft
     * also nur AUSFUEHRBAREN Code (`riegel.test.ts:338-346`). Der Scan in
     * `_lib/code.test.ts` VERBIETET den Namen im ROHEN Quelltext, Kommentare
     * eingeschlossen (`_lib/code.test.ts:139-140`) — seine POSITIVE Haelfte liest dort
     * dagegen kommentarfrei (`:141-144`), und ohne diesen Halbsatz beschriebe der Satz
     * genau die Haelfte, die die Fix-Runde zu A2 nicht angefasst hat (Fund M2). Keine
     * ersetzt die andere: diese hier ist breit (alle AUSGELIEFERTEN Modul-Dateien —
     * Testdateien und diese Datei selbst sind ausgenommen, `:154`), jene ist tief.
     *
     * Zeilenweise wie alle Scans dieser Datei — ein ueber zwei Zeilen umbrochener Aufruf
     * kaeme durch. Ein Scan darf falsch-negativ nicht sein wollen, aber er ist hier die
     * Untergrenze und nicht der Beweis.
     */
    expect(quellDateien().length, "leere Dateiliste — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(10);
    expect(
      trefferAuf(/\bMath\s*\.\s*random\b/),
      "Codes und Geheimnisse dieses Moduls kommen aus crypto.getRandomValues (Spec:2089-2091)",
    ).toEqual([]);
  });
});

describe("die Bereinigung selbst — der Waechter ueber dem Waechter", () => {
  /*
   * ⛔ DIESER BLOCK PRUEFT NICHT DAS MODUL, SONDERN DEN SCAN. Er steht hier, weil Fund M1
   * (`.superpowers/sdd/planteil3/REVIEW-A2.md`) genau die Fehlerklasse war, gegen die dieser
   * ganze Weg antritt: ein Waechter, der WENIGER findet als er soll, und dabei gruen bleibt
   * (NT11 im Ausfuehrungsplan).
   *
   * ⛔ DIE QUELLEN UNTEN SIND SYNTHETISCH UND STEHEN ABSICHTLICH NICHT IM BAUM. Gemessen am
   * 2026-08-23: der Schnitt in `ohneKommentareUndZeichenketten` greift heute an genau acht
   * Stellen des Moduls, und alle acht sind echte nachgestellte Kommentare — kein einziges
   * Regexliteral kollidiert. Ein Fall, der auf eine Datei des Moduls zeigte, waere also
   * leer-gruen und bewachte nichts. Die Blindstelle ist die WAECHTERSTAERKE ab der naechsten
   * Flaeche, nicht der Bestand.
   */
  const MIT_REGEX = [
    "export function sonde(x: string) {",
    "  const teile = x.split(/\\//); requireRadioHost(kopf);",
    "  return teile;",
    "}",
  ].join("\n");

  it("ein Regexliteral mit zwei Schraegstrichen kappt den Rest der Zeile NICHT", () => {
    /*
     * DER ROTE FALL VON FUND M1, als Test statt als Sonde. `/\//` traegt zwei
     * Schraegstriche nebeneinander; der Schnitt `replace(/\/\/.*$/gm, "")` haelt sie fuer
     * einen Kommentarbeginn und loescht alles dahinter — hier den Riegelaufruf selbst.
     * An einer NEGATIVEN Zusicherung heisst das: weniger Text, weniger gefundene
     * Verstoesse, und der Fall bleibt STILL gruen.
     */
    expect(bereinigt(MIT_REGEX), "das Regexliteral kappt den Riegelaufruf dahinter")
      .toMatch(/\brequireRadioHost\s*\(/);
  });

  it("ein echter nachgestellter Kommentar wird weiterhin geschnitten", () => {
    /*
     * DIE GEGENRICHTUNG, und sie gehoert unmittelbar daneben: ohne sie liesse sich der Fall
     * oben erfuellen, indem man den Schnitt ganz entfernt — dann erfuellte ein blosses
     * `// frueher: requireRadioHost(kopf)` jede positive Zusicherung wieder (Fund N1-b).
     */
    const mitKommentar = "await requireRadioAdmin(); // frueher: requireRadioHost(kopf)\n";
    expect(bereinigt(mitKommentar), "der nachgestellte Kommentar steht noch da")
      .not.toMatch(/\brequireRadioHost\s*\(/);
    expect(bereinigt(mitKommentar), "der ausfuehrbare Teil der Zeile wurde mitgeschnitten")
      .toMatch(/\brequireRadioAdmin\s*\(/);
  });

  it("die Zeilenzahl bleibt erhalten — sonst luegen alle datei:zeile-Meldungen", () => {
    const roh = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    expect(bereinigt(roh).split("\n").length).toBe(roh.split("\n").length);
  });

  it("kein Scan dieser Datei liest die ungeschuetzte Fassung direkt", () => {
    /*
     * ⛔ DER RIEGEL GEGEN DIE RUECKKEHR VON M1. `ohneKommentareUndZeichenketten` darf genau
     * zweimal vorkommen: in seiner eigenen Deklaration und in `bereinigt`. Jede weitere
     * Fundstelle ist ein Scan, der die Regexliterale wieder ungeleert liest — und das faellt
     * an einer negativen Zusicherung niemandem auf.
     */
    // ⛔ UEBER `ohneKommentare` GELESEN, NICHT UEBER DEN ROHTEXT: eine blosse ERWAEHNUNG des
    // Namens in einem Kommentar dieser Datei waere sonst eine dritte Fundstelle, und der Fall
    // waere rot mit einer Meldung, die etwas anderes behauptet — NT11 im Kleinen. Die Nadel
    // ist zusammengesetzt, weil das Literal selbst im gescannten Text steht.
    const nadel = "ohneKommentareUnd" + "Zeichenketten(";
    const stellen = ohneKommentare(readFileSync(SELBST, "utf8")).split(nadel).length - 1;
    expect(stellen, "ein Scan liest die ungeschuetzte Fassung direkt").toBe(2);
  });
});
