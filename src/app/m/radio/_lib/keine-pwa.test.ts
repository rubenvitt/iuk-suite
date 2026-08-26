// src/app/m/radio/_lib/keine-pwa.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ohneKommentare } from "./quelltextScan";

/**
 * `radio` BEWIRBT KEINE PWA — DER FUENFTE MODULWEITE QUELLTEXT-SCAN DIESES MODULS
 * (Spec 1 §7.1, `Spec:5511-5513` und `Spec:5673-5678`; Planteil 5, Aufgabe G6).
 *
 * ⛔ DIE VIER VORGAENGER SIND `riegel.test.ts`, `_lib/bauform.test.ts`,
 * `_actions/guards.test.ts` und `admin/actions.test.ts`. Diese Datei ist der FUENFTE.
 * ⚠️ DIESE VIER SIND DEFINITORISCH, NICHT GEZAEHLT — sie sind die Liste aus `KONTEXT.md:389-390`
 * („Vier Quelltext-Scans bewachen das Modul … und der vierte aus Planteil 4"), nicht das Ergebnis
 * eines `grep`. GEMESSEN am 2026-08-27 liefert `grep -rl "readdirSync" src/app/m/radio` ZWANZIG
 * Dateien, darunter `_ui/verwaltung-css.test.ts` (Planteil 4, V12): ein modulweiter Walker mit
 * eigener Rekursion (`:56-68`), demselben Endungs- und Namensfilter und einer Untergrenzenwache
 * (`MODUL_DATEIEN_MINDESTENS = 60`, `:47`) — er ist in dieser VIER NICHT enthalten. Die
 * Ordinalzahl steht hier also als DEFINITION; GEZAEHLT ist allein die Importeurszahl darunter
 * (REVIEW-G6, Hinweis H1).
 * ⚠️ SIE IST ABER NICHT DER FUENFTE KONSUMENT VON `_lib/quelltextScan.ts`. Der Brief verlangte
 * urspruenglich „fuenfter Scan, fuenfter Konsument" und irrte in der zweiten Haelfte; die
 * Plandokumente sind in der FIX-RUNDE 1 berichtigt (Ruling R-G6-1) und tragen jetzt die gezaehlte
 * Zahl. GEMESSEN mit `grep -rln 'from ".*quelltextScan"' src/app/m/radio`: am 2026-08-26 **15**
 * Dateien VOR dieser hier (u. a. `riegel.test.ts:5`, `admin/actions.test.ts:5`,
 * `_ui/verwaltung-css.test.ts:5`, `admin/(arbeit)/geraete/export/route.test.ts:12`,
 * `admin/(druck)/zugaenge/blatt/page.test.tsx:13`), am 2026-08-27 mit ihr **16**.
 * ⛔ DIESE DATEI IST DER **SECHZEHNTE** IMPORTEUR. Eine Vollzaehligkeitsbehauptung, die nicht
 * traegt, ist schlimmer als keine (`KONTEXT.md`, zweite Lehre aus Planteil 4: „Wer ‚alle‘
 * schreibt, zaehlt vorher") — deshalb steht hier die gezaehlte Zahl.
 *
 * ⛔ DIE ABGRENZUNG, DAMIT DIE ZAEHLUNG NICHT VERRUTSCHT: `_lib/quelltextScan.ts` ist NICHT
 * einer der Scans, sondern ihr gemeinsamer HELFER (E-G6). Diese Datei hier ist der fuenfte
 * Scan; sie implementiert den Kommentarschnitt NICHT erneut, sondern importiert ihn.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ E-G6a — WARUM `ohneKommentare` UND NICHT `bereinigt`, UND WARUM DAS AUFLAGE 6 EINHAELT
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Auflage 6 (`KONTEXT.md:389-395`) sagt: „Wer einen fuenften Scan anlegt, uebernimmt sie [die
 * dreiteilige Reparatur]." Die LEHRE der Reparatur steht woertlich in
 * `_lib/quelltextScan.ts:55-59`:
 *
 *   „BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 *    BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 *    Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 *    damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 *    falsch-negativ und still."
 *
 * ⛔ FUER EIN ZEICHENKETTEN-VERBOT IST `bereinigt` GENAU DIE FALSCH-NEGATIVE, STILLE FORM.
 * `bereinigt` ist `ohneRegexLiterale(ohneKommentareUndZeichenketten …)` mit nachgestelltem
 * Kommentarschnitt (`_lib/quelltextScan.ts:208-209`), und die mittlere Stufe LEERT JEDES
 * `"`-, `'`- und Backtick-Literal (`_lib/quelltextScan.ts:117-127`). Daraus folgt, gemessen:
 *
 *   1. DREI der fuenf verbotenen Zeichenketten unten koennen im Quelltext NUR INNERHALB
 *      eines Literals stehen — `manifest.webmanifest` ist ein Pfad, `rel="manifest"` traegt
 *      selbst ein Literal, `beforeinstallprompt` ist das Argument eines `addEventListener`.
 *      Nach `bereinigt` sind sie NIE auffindbar; der Scan waere fuer 3/5 seiner Zusagen
 *      still leer.
 *   2. `_lib/sw-quelle.ts` ist zu praktisch 100 % ein Template-Literal. Nach `bereinigt`
 *      bliebe `export const RADIO_SW_ABRAEUM_QUELLE =   ;` — ausgerechnet die Datei, die am
 *      ehesten ein `serviceWorker.register` truege, waere fuer den Scan LEER.
 *
 * ⛔ WAS AUFLAGE 6 WIRKLICH VERBIETET, und es gilt hier unveraendert: einen EIGENEN
 * Kommentarschnitt zu schreiben. `ohneKommentare` (`_lib/quelltextScan.ts:61`) ist ein
 * EXPORTIERTER Baustein derselben Datei, kein Nachbau. Wer ihn nachbaut, baut den Fehler zum
 * fuenften Mal.
 * ⚠️ Die zwei Zwischenstufen des Helfers sind bewusst modul-privat
 * (`_lib/quelltextScan.ts:25-31`): der Waechter, der ihren Direktaufruf verbietet, ist ein
 * ZAEHLER ueber dem Dateitext (`admin/actions.test.ts`, Fall „kein Scan dieses Moduls liest
 * die ungeschuetzte Fassung direkt") und saehe einen Aufruf aus einer fremden Datei nicht.
 *
 * ⛔ DIE FOLGE, DIE NIEMAND „REPARIEREN" DARF: EIN NACHGESTELLTES `// … manifest.webmanifest`
 * AM ENDE EINER CODEZEILE WIRD GEMELDET. `ohneKommentare` schneidet nur Blockkommentare und
 * Zeilen, deren getrimmter Inhalt mit `//` BEGINNT (`_lib/quelltextScan.ts:55-59`, `:78`).
 * Das ist FALSCH-POSITIV MIT ABSICHT und die gewollte Richtung — der Fall
 * „… aber ein nachgestelltes Kommentarende wird GEMELDET" haelt sie als Zusicherung fest,
 * damit sie niemand still auf `bereinigt` zurueckdreht.
 *
 * ⛔ E-G6a IST NICHT BEHAUPTET, SONDERN GEMESSEN (Sonde S-G6b, 2026-08-26): tauscht man den
 * Import auf `bereinigt`, werden DREI Faelle rot — „eine verbotene Zeichenkette INNERHALB
 * eines Literals wird gefunden", „… aber ein nachgestelltes Kommentarende wird GEMELDET" und
 * „jedes der fuenf Muster meldet an einer synthetischen Quelle". ⛔ Der Verbotsfall ueber den
 * 98 echten Dateien bliebe dabei GRUEN — das ist genau die stille Form, gegen die Auflage 6
 * antritt, und der Grund, warum die drei synthetischen Faelle hier stehen.
 *
 * ⬜ V-L9 IST HIER BEWUSST NICHT ERLEDIGT (E-G6). `_lib/bauform.test.ts` und
 * `_actions/guards.test.ts` tragen die reparierte Bereinigung weiterhin als eigene Kopie;
 * sie umzustellen waere eine Aenderung an drei fremden Waechtern fuer einen Nutzen, den kein
 * Tor misst. Eigentuemer bleibt das ClickUp-Board.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ BAUFORM 28 — `isDirectory()` STEHT VOR DEM ENDUNGSFILTER, UND HIER HAENGT ES AN EINEM
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * `src/app/m/radio/sw.js/` ist ein VERZEICHNIS mit einem Punkt im Namen (Aufgabe G5), und
 * `/\.tsx?$/.test("sw.js")` ist FALSCH. Wer den Endungsfilter zuerst anwendet, ueberspringt
 * `sw.js/` samt `sw.js/route.ts` — er waere blind fuer genau die eine Datei, die einen
 * Service Worker ausliefert, und die Zahl unten stimmte trotzdem, weil sie am selben kaputten
 * Lauf gemessen waere.
 * ⚠️ GEMESSEN (Sonde S-G6e, 2026-08-26) IST DER SCHADEN GROESSER ALS DIESE EINE DATEI: der
 * Endungsfilter sperrt dann JEDE Rekursion, weil kein Verzeichnisname unter `radio` auf
 * `.ts`/`.tsx` endet. Von 98 Dateien bleiben ZWEI (`layout.tsx`, `page.tsx`); der Zaehlfall
 * meldet `expected 2 to be 98`, der `sw.js`-Fall `expected [ 'layout.tsx', 'page.tsx' ]`.
 * Die Richtung des Fundes bleibt dieselbe — nur lauter, als der Plan erwartet hat.
 * Die Hausform ist gemessen und wird uebernommen:
 * `_lib/bauform.test.ts:174-181` und `riegel.test.ts:185-192` pruefen `isDirectory()` ZUERST.
 * ⚠️ Der Brief nennt fuer `riegel.test.ts` die Zeilen `:184-191`; nachgemessen am 2026-08-26
 * steht `isDirectory()` dort auf `:185` und der Endungsfilter auf `:190`.
 * ⛔ Der Fall „sw.js/route.ts steht in der gescannten Liste" ist die Gegenprobe dazu — ohne
 * ihn bewachte die Zahl nur sich selbst.
 *
 * ⛔ DIE ZAHL STEHT ALS `toBe`, NIE ALS `toBeGreaterThanOrEqual` (`riegel.test.ts:98-108`:
 * „EINE KLAUSEL OHNE UNTERGRENZE UEBER EINER LEEREN MENGE IST LEER-GRUEN UND BEWACHT NICHTS"
 * und „UND HIER GENUEGT DIE UNTERGRENZE NICHT — SIE WAERE SELBST DER FEHLER").
 * ⚠️ SIE IST VOLATIL: jede spaetere Quelldatei unter `src/app/m/radio/` hebt sie, und das ist
 * gewollt — wer die Flaeche baut, bekommt den Fall rot und hebt die Zahl BEWUSST.
 * ⛔ GEMESSEN (Sonde S-G6c, 2026-08-26): richtet man die Wurzel auf ein nicht existierendes
 * Verzeichnis, laeuft der Verbotsfall „radio bewirbt keine PWA" ueber einer LEEREN Liste und
 * bleibt GRUEN. Rot werden nur der Zaehlfall (`expected +0 to be 98`) und der `sw.js`-Fall.
 * ⛔ DIESE GRUENE HAELFTE IST DIE GANZE BEGRUENDUNG DES ZAEHLFALLS: ohne ihn meldete ein Scan,
 * der nichts mehr liest, weiterhin „keine PWA gefunden" — leer-gruen und wirkungslos.
 *
 * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit: DIESE Datei fuehrt jede
 * der fuenf verbotenen Zeichenketten als Suchmuster und in ihren synthetischen Sonden. Ein
 * Scan, der Testdateien mitlaese, machte genau den Test rot, der die Zusicherung TRAEGT — und
 * wuerde dann abgeschaltet statt repariert. Der Verlust ist klein und benannt: eine Verletzung
 * AUSSCHLIESSLICH in einer Testdatei bleibt unentdeckt; Testdateien werden nicht ausgeliefert.
 *
 * ⛔ ACHT FAELLE, NICHT SIEBEN — UND DER ACHTE IST DER GRUND, WARUM DIE MUSTERLISTE UEBERHAUPT
 * BEWACHT IST. Der Brief zaehlt sieben (`briefs/G6.md`, „Die sieben Faelle schreiben"); die
 * fuenf Sonden decken davon aber nur `serviceWorker.register` (S-G6a) und eine Zeichenkette im
 * Literal (S-G6b) ab. Ein Tippfehler in einem der vier UEBRIGEN Muster — etwa
 * `beforeinstalprompt` — waere ueber den 98 echten Dateien STUMM GRUEN, weil dort ohnehin kein
 * Treffer erwartet wird. `jedes der fuenf Muster meldet an einer synthetischen Quelle`
 * schliesst das, und zwar dauerhaft statt durch eine zurueckgenommene Sonde. Die Form ist die
 * des Falls „eine verbotene Zeichenkette INNERHALB eines Literals wird gefunden" — also die
 * Architektur, die diese Datei schon traegt, keine neue. Praezedenzfall fuer eine ZUSAETZLICHE
 * Zusicherung gegenueber dem Plan: **R-G3-2** (`.superpowers/sdd/planteil5/progress.md`).
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: was `https://radio.iuk-ue.de/manifest.webmanifest` im
 * Betrieb tatsaechlich ANTWORTET. Das ist die Server-Haelfte und bleibt ⬜ G-L6; hier steht die
 * BAUFORM-Haelfte von V8/R36 aus Spec 2 — sie laeuft im Repo, nicht als `curl`.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");

/**
 * ⛔ DIE FUENF VERBOTE (Brieftafel G6). Jedes Muster ist BEWUSST GROSSZUEGIG: ein Muster, das
 * zu viel meldet, ist laut und wird repariert; eins, das zu wenig meldet, ist still
 * (`_lib/quelltextScan.ts:55-59`).
 *
 *   `serviceWorker.register`  `radio` registriert KEINEN Worker — die Route `/sw.js` wird von
 *                             der Update-Pruefung des ALT-Workers abgeholt (`Spec:5673-5678`,
 *                             `_lib/sw-quelle.ts:11-14`).
 *   `manifest.webmanifest`    kein Manifest (`Spec:5511-5513`)
 *   `rel="manifest"`          kein `<link>` darauf
 *   `manifest:`               kein `manifest`-Feld in einem Next-`metadata`-Export
 *   `beforeinstallprompt`     kein Installations-Banner
 *
 * ⛔ KEIN `g`-FLAG: ein globales Muster fuehrt `lastIndex` mit sich und liefert bei
 * wiederholtem `test()` abwechselnd `true`/`false` — ueber 98 Dateien waere das genau die
 * stille Richtung.
 *
 * ⛔ EINE AUFLAGE AN DIE NACHFOLGER, wie sie die Zahl der gescannten Dateien schon traegt — UND
 * ZWEI VERSCHIEDENE MECHANISMEN TRAGEN SIE, je einer je Richtung. Beide am 2026-08-27 gemessen:
 *
 *   HINZUFUEGEN  Wer ein sechstes Muster eintraegt, traegt seine Nadel in `SONDE_ALLE_FUENF`
 *                (`:290-296`) nach. Sonst ist die Sollmenge des Falls „jedes der fuenf Muster
 *                meldet an einer synthetischen Quelle" um einen Eintrag groesser als die
 *                Fundmenge — und ausserdem stimmt `VERBOTE_ANZAHL` nicht mehr.
 *   ENTFERNEN    ⛔ DAFUER TRUG DER FALL BIS ZUR FIX-RUNDE 1 GAR NICHTS: seine Sollmenge leitet
 *                sich aus `VERBOTE` SELBST ab (`:352`), also schrumpfen BEIDE Seiten des
 *                Vergleichs mit. GEMESSEN: mit getilgtem `["serviceWorker.register", …]`
 *                (`:184`) lief die Datei `Tests 8 passed (8)` — das ERSTE Verbot der Brieftafel,
 *                und das einzige mit `Spec:5673-5678`, liess sich STILL streichen. Der Zaehler
 *                `VERBOTE_ANZAHL` unten ist die Wache dagegen.
 *
 * ⚠️ WAS HIER BIS ZUR FIX-RUNDE 1 UNQUALIFIZIERT STAND, und es war fuer eine der zwei
 * Richtungen gemessen FALSCH: „der Fall haelt die Sollmenge ueber `VERBOTE` selbst und wird sonst
 * rot" (`REVIEW-G6.md`, Fund W1). Fuer das Hinzufuegen traegt der Satz, fuer das Entfernen nicht.
 */
const VERBOTE: [string, RegExp][] = [
  ["serviceWorker.register", /serviceWorker\s*\.\s*register/],
  ["manifest.webmanifest", /manifest\.webmanifest/],
  ['rel="manifest"', /rel\s*=\s*\{?\s*['"]manifest['"]/],
  ["metadata-Feld manifest:", /\bmanifest\s*:/],
  ["beforeinstallprompt", /beforeinstallprompt/],
];

/**
 * ⛔ DIE MUSTERLISTE BEKOMMT DIESELBE WACHE WIE DIE DATEIMENGE (Fix-Runde 1 zu G6, Fund W1).
 * Global Constraint 7 des Planteils
 * (`docs/superpowers/plans/2026-08-26-radio-modul-plan5-betrieb-tests.md:219-223`): „Wer ‚alle'
 * schreibt, zaehlt vorher. Eine Vollzaehligkeitsbehauptung, die nicht traegt, ist schlimmer als
 * keine … steht als `toBe`, NIE als `toBeGreaterThanOrEqual`." Der Testname sagt „jedes der
 * FUENF Muster" — ohne diese Zahl war das eine Behauptung ohne Traeger.
 * ⚠️ DER NAME ENDET AUF `_ANZAHL` UND NICHT AUF `_MINDESTENS`, aus dem Grund, den
 * `riegel.test.ts:98-108` ausschreibt: bei `toBe` waere „mindestens" eine Luege, und der naechste
 * Leser „repariert" den Namen zurueck auf `>=`.
 */
const VERBOTE_ANZAHL = 5;

/**
 * ⛔ BEIM BAU GEMESSEN, NICHT GESCHAETZT (2026-08-26, Aufgabe G6): der erste Lauf dieser Datei
 * stand auf `toBe(0)` und meldete `expected 0 to be 98` — die 98 ist ALSO ABGELESEN.
 * ⚠️ Sie deckt sich mit dem Vorabscan (`VORABSCAN.md`, Tabelle „G5 → G6": 96 Dateien vor G5,
 * +2 durch `sw.js/route.ts` und `_lib/sw-quelle.ts`).
 *
 * DER ANHEBE-FAHRPLAN, als Auflage an die Nachfolger: G7 legt KEINE Quelldatei an (E-G7 —
 * `/api/health/radio` bekommt keine Datei). Wer als Naechster eine `.ts`/`.tsx` unter
 * `src/app/m/radio/` anlegt, hebt diese Zahl HIER und traegt seinen Grund ein.
 */
const QUELLDATEIEN_ANZAHL = 98;

/**
 * Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv, OHNE Testdateien.
 *
 * ⛔ `isDirectory()` STEHT VOR DEM ENDUNGSFILTER (Bauform 28, Kopf dieser Datei). Hausform:
 * `_lib/bauform.test.ts:174-181`, `riegel.test.ts:185-192`.
 */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/** Der modulrelative Pfad mit `/` als Trenner — die Form, in der die Meldungen lesen. */
function kurzPfad(pfad: string): string {
  return relative(MODUL, pfad).replace(/\\/g, "/");
}

/**
 * ⛔ DIE EINE STELLE, AN DER GESUCHT WIRD — und der Grund, warum sie eine benannte Funktion
 * ist und keine Schleife im Testkoerper: die synthetischen Sonden unten pruefen DENSELBEN
 * Sucher, der ueber die 98 echten Dateien laeuft. Ein Muster, das nie treffen KANN (ein
 * Tippfehler im Regexliteral, eine geaenderte Schreibweise), waere ueber den echten Dateien
 * stumm gruen; der Fall „jedes der fuenf Muster meldet an einer synthetischen Quelle" faengt
 * genau das.
 *
 * Die Meldung nennt DATEI UND ZEICHENKETTE, nicht nur „gefunden".
 *
 * ⛔ GEMESSEN, 2026-08-26, alle Sonden zurueckgenommen:
 *   S-G6a  `navigator.serviceWorker.register("/sw.js")` als CODE (nicht als Kommentar) an das
 *          Ende von `_lib/sw-quelle.ts` gehaengt → „radio bewirbt keine PWA" ROT, Meldung
 *          `_lib/sw-quelle.ts: serviceWorker.register`.
 *   S-G6g  `ohneKommentare` hier weggelassen und roh gelesen → „der Scan sieht durch einen
 *          Kommentar hindurch" ROT, UND „radio bewirbt keine PWA" ROT: `layout.tsx:28` und
 *          `_ui/AusleihRahmen.tsx:60` nennen `manifest.webmanifest` in BLOCKKOMMENTAREN,
 *          `_lib/sw-quelle.ts:11` nennt dort `serviceWorker.register()`. Ohne den Schnitt
 *          waere dieser Scan auf seiner eigenen Begruendung rot.
 *   S-G6f  ein Muster verstuemmelt (`manifest:` → `manifezt:`) → NUR „jedes der fuenf Muster
 *          meldet an einer synthetischen Quelle" ROT; der Verbotsfall bleibt gruen. Das ist
 *          die Blindstelle, gegen die der achte Fall steht.
 */
function verstoesse(kurz: string, quelle: string): string[] {
  const q = ohneKommentare(quelle);
  return VERBOTE.filter(([, muster]) => muster.test(q)).map(([name]) => `${kurz}: ${name}`);
}

/** Ein Kommentar ist kein Verstoss — weder als Zeilen- noch als Blockkommentar. */
const SONDE_KOMMENTAR = [
  "export const x = 1;",
  "// serviceWorker.register wird hier nur beschrieben, nicht gerufen",
  "/* und hier ein Pfad im Blockkommentar: manifest.webmanifest */",
  "export const y = 2;",
].join("\n");

/** ⛔ Die gewollte Falsch-Positiv-Richtung: nachgestellter Kommentar, und er WIRD gemeldet. */
const SONDE_NACHGESTELLT = "export const x = 1; // manifest.webmanifest";

/** ⛔ Die K1-Probe: die Nadel steht INNERHALB eines Zeichenkettenliterals. */
const SONDE_LITERAL = [
  "export function melde(fenster: Window): void {",
  '  fenster.addEventListener("beforeinstallprompt", (e) => e.preventDefault());',
  "}",
].join("\n");

/** ⛔ Alle fuenf Nadeln, je einmal — die Lebendprobe der Musterliste. */
const SONDE_ALLE_FUENF = [
  'navigator.serviceWorker.register("/sw.js");',
  'const pfad = "/manifest.webmanifest";',
  'const knoten = <link rel="manifest" href={pfad} />;',
  "export const metadata = { manifest: pfad };",
  'window.addEventListener("beforeinstallprompt", weiter);',
].join("\n");

describe("keine PWA unter m/radio", () => {
  it("radio bewirbt keine PWA", () => {
    const gefunden = quellDateien().flatMap((pfad) =>
      verstoesse(kurzPfad(pfad), readFileSync(pfad, "utf8")),
    );
    expect(
      gefunden.sort(),
      "eine radio-Quelldatei bewirbt eine PWA (Spec:5511-5513, Spec:5673-5678)",
    ).toEqual([]);
  });

  it("die Zahl der gescannten Dateien steht EXAKT auf dem Stand dieses Planteils", () => {
    expect(
      quellDateien().length,
      "der Scan liest eine andere Menge als beim Bau gemessen — Wurzel, Endungenliste oder eine neue Flaeche",
    ).toBe(QUELLDATEIEN_ANZAHL);
  });

  it("es gibt kein manifest.webmanifest-Verzeichnis unter radio", () => {
    expect(
      existsSync(join(MODUL, "manifest.webmanifest")),
      "unter src/app/m/radio/ ist ein manifest.webmanifest-Handler entstanden (Spec 2, V8/R36)",
    ).toBe(false);
  });

  it("der Scan sieht durch einen Kommentar hindurch", () => {
    expect(
      verstoesse("sonde-kommentar.ts", SONDE_KOMMENTAR),
      "ein Kommentar wird als Verstoss gemeldet — der Schnitt aus _lib/quelltextScan.ts:61 fehlt",
    ).toEqual([]);
  });

  it("... aber ein nachgestelltes Kommentarende wird GEMELDET, und das ist Absicht", () => {
    expect(
      verstoesse("sonde-nachgestellt.ts", SONDE_NACHGESTELLT),
      "der Scan schneidet nachgestellte Kommentare — das ist die falsch-negative, stille Richtung (_lib/quelltextScan.ts:55-59)",
    ).toEqual(["sonde-nachgestellt.ts: manifest.webmanifest"]);
  });

  it("eine verbotene Zeichenkette INNERHALB eines Literals wird gefunden", () => {
    expect(
      verstoesse("sonde-literal.ts", SONDE_LITERAL),
      "der Sucher liest ueber eine Fassung, die Zeichenkettenliterale leert — drei der fuenf Verbote waeren strukturell blind (E-G6a)",
    ).toEqual(["sonde-literal.ts: beforeinstallprompt"]);
  });

  it("jedes der fuenf Muster meldet an einer synthetischen Quelle", () => {
    expect(
      VERBOTE.length,
      "die Verbotsliste hat eine andere Laenge als beim Bau — ein GETILGTER Eintrag ist hier still, weil die Sollmenge unten aus VERBOTE selbst kommt (REVIEW-G6, Fund W1)",
    ).toBe(VERBOTE_ANZAHL);
    expect(
      verstoesse("sonde-alle.tsx", SONDE_ALLE_FUENF).sort(),
      "ein Muster der Verbotsliste kann nicht mehr treffen und ist ueber den echten Dateien stumm gruen",
    ).toEqual(VERBOTE.map(([name]) => `sonde-alle.tsx: ${name}`).sort());
  });

  it("sw.js/route.ts steht in der gescannten Liste", () => {
    expect(
      quellDateien().map(kurzPfad),
      "der Endungsfilter steht vor isDirectory() — sw.js/ faellt aus dem Scan (Bauform 28)",
    ).toContain("sw.js/route.ts");
  });
});
