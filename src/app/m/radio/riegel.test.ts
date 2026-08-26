// src/app/m/radio/riegel.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bereinigt, ohneKommentare } from "./_lib/quelltextScan";

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
 * ✅ ⬜ Z-L1 / ⬜ V-L3 IST AM 2026-08-26 ABGELESEN — mit Messwerten, nicht als „geprueft".
 * Bis dahin stand hier: „⚠️ WAS SIE AUSDRUECKLICH NICHT BELEGT: dass ein Riegel bei einem
 * echten Abruf GREIFT. Am Ende von Planteil 2 liegt unter den beiden Verwaltungs-Huellen
 * KEINE `page.tsx`; Next rendert sie also nicht." Der zweite Satz ist seit V12 ueberholt,
 * der erste bleibt fuer DIESE DATEI wahr: sie ist ein QUELLTEXT-Scan und belegt eine
 * Bauform, keine Wirkung. Gemessen hat es Aufgabe V23 mit einem laufenden `next dev` auf
 * `radio.localtest.me:3100`; die Faelle stehen als DAUERFAELLE in
 * `e2e/radio-verwaltung.spec.ts` („V-L3 A" bis „V-L3 D") und laufen bei jedem
 * Playwright-Lauf mit:
 *
 *   A  `/admin` OHNE Sitzung          -> HTTP 307, `Location: /login?callbackUrl=
 *                                       http%3A%2F%2Fradio.localtest.me%3A3100%2Fadmin`
 *      ⚠️ Die 307 steht hier als MESSWERT, nicht als Zusage: `redirect()` waehlt den Code
 *      zur Laufzeit, und ⬜ L7 (`_lib/zugang.ts:332-336`) liest ihn beim Cutover ab. Der
 *      Dauerfall prueft deshalb eine Menge von Umleitungscodes, nicht die Zahl.
 *   B  `/admin` MIT Sitzung, ohne beide Gruppen        -> HTTP 404 (nicht 403), dazu die
 *      Protokollzeile aus `_lib/zugang.ts` im Serverstrom: „[radio] Zugriff auf /admin
 *      abgelehnt: keine der Gruppen [ iuk-radio-admin ] in den Token-Gruppen [ ]".
 *   C  `/admin` mit der Updater-Gruppe -> HTTP 200, und die Modulleiste traegt genau VIER
 *      `nav-link`-Knoten (`_lib/nav.ts:94` filtert `NUR_ADMIN` aus, die Liste steht `:51`).
 *   D  `/admin/versionen` mit der Updater-Gruppe -> HTTP 404, mit der Admin-Gruppe -> 200.
 *      ⛔ Das ist die WIRKPROBE der namentlichen Zusicherung weiter unten: eine faelschlich
 *      abgesenkte Seite im `(arbeit)`-Zweig faengt Klausel (a)/(e) strukturell nicht.
 *   E  ⛔ TRAEGT DAS LAYOUT ODER DIE SEITE? Probe: `await requireRadioVerwaltung();` in
 *      `admin/(arbeit)/page.tsx:91` von Hand entfernt und Fall B wiederholt.
 *      ERGEBNIS: **weiterhin 404**, mit derselben Protokollzeile. ✅ **Das Layout traegt.**
 *      Der Verwaltungsriegel haengt also NICHT an zehn einzelnen Seitenzeilen; die Zeile in
 *      der Seite ist der zweite Riegel, den `Spec:569-571` verlangt („Route-Group-Grenzen
 *      sind keine Sicherheitsgrenzen"), nicht der einzige. Die Sonde ist zurueckgenommen,
 *      der Arbeitsbaum danach byteweise gleich.
 *
 * ⛔ WAS DAS NICHT HEISST, und es steht hier, statt verschwiegen zu werden: A bis E messen
 * den `(arbeit)`-Zweig. Fuer `admin/(druck)` gibt es keine eigene Wirkprobe des
 * PERSONEN-Riegels — die einzige Messung dort ist Fall 5a („das Blatt druckt ohne Kopfzeile
 * und ohne Navigationsleiste"), und die betrifft die Huelle, nicht die Stufe. ⬜ **V-L14** —
 * die Wirkprobe fuer `requireRadioAdmin()` in `admin/(druck)/layout.tsx` fehlt (eigene Nummer
 * seit dem 2026-08-26); Eigentuemer ist die Schlusspruefung von Planteil 4.
 * ⛔ Kein Fall in dieser Datei darf mehr behaupten als das hier Abgelesene.
 *
 * ⚠️ ZWEI FORMEN, UND DER UNTERSCHIED IST TRAGEND (Vorbild `bauform.test.ts:13-37`):
 *
 *   EXISTENZPFLICHT — der Scan behauptet, dass es die Dateien GIBT, und nennt eine
 *   Untergrenze. Heute nur Klausel (a): ZWEI `admin/**\/layout.tsx` (Z6).
 *
 *   EIGENSCHAFTSFORM — der Scan toleriert, dass es die Dateien noch nicht gibt, und sagt
 *   nur etwas ueber die, die da sind. Heute Klausel (c) und (e): ZWEI Route Handler
 *   (Planteil 3) und EINE Verwaltungsseite (V12) — die Form bleibt, die Zahlen wachsen.
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
 *   Planteil 3 (`t/[code]/route.ts`, `abmelden/route.ts`) -> 2 · V18 `import/hochladen`
 *   -> 3 · V22 `geraete/export` -> 4 · G5 `sw.js/route.ts` -> 5 — ⛔ ALLE ERLEDIGT; FUER
 *   DIESE ZAHL braucht die naechste Anhebung einen NEUEN EINTRAG HIER, keine stille Zahl.
 *
 *   Planteil 3 baut `page.tsx` und den Ausleihzweig — beide AUSSERHALB von `admin/`,
 *                                                    -> ADMIN_SEITEN_ANZAHL bleibt 0
 *   Planteil 4 baut die zehn Seiten aus Spec:4369-4378
 *                                    -> ERLEDIGT (V21), ADMIN_SEITEN_ANZAHL = 10
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
 * ⛔ HEUTE FUENF — EXAKT, nicht „mindestens". `t/[code]/route.ts`, `abmelden/route.ts`
 * (Planteil 3, Aufgabe A10), `admin/(arbeit)/import/hochladen/route.ts` (V18, E-V16),
 * `admin/(arbeit)/geraete/export/route.ts` (V22) und `sw.js/route.ts` (Planteil 5, G5) —
 * DER FAHRPLAN OBEN IST ABGEARBEITET. Die Konstante steht hier, damit es EINE Zeile ist.
 */
const HANDLER_ANZAHL = 5;

/**
 * ⛔ HEUTE ZEHN — EXAKT, wie `HANDLER_ANZAHL`. V12 die Uebersicht (0 auf 1), V13 die Liste
 * (1 auf 2), V14 die Akte (2 auf 3), V15 die Historie (3 auf 4), V16 die Ausleihen (4 auf 5),
 * V17 der Update-Modus (5 auf 6), V18 der Import (6 auf 7), V19 die Versionen (7 auf 8), V20
 * die Zugaenge (8 auf 9), V21 das Druckblatt (9 auf 10, Spec:4378) — ⛔ DER ANHEBE-FAHRPLAN
 * IST FUER DIESE ZAHL ABGEARBEITET, die naechste Anhebung braucht einen neuen Grund.
 * ⚠️ `ADMIN_SEITEN()` (Dateiende) zaehlt seit der Fix-Runde 1 zu V15 AUCH
 * `template.tsx`/`default.tsx` — heute gibt es keine.
 */
const ADMIN_SEITEN_ANZAHL = 10;

/** Zwei Verwaltungs-Huellen: `admin/(arbeit)/layout.tsx` und `admin/(druck)/layout.tsx` (Z6). */
const ADMIN_LAYOUTS_MINDESTENS = 2;

/**
 * ⛔ HEUTE FUENF: `page.tsx` (Gate, A11), `(ausleihe)/layout.tsx` + `geraete/page.tsx` (A18),
 * `ausleihen/page.tsx` (A19), `rueckgabe/page.tsx` (A20) — der Fahrplan oben ist damit
 * ABGEARBEITET, die naechste Anhebung braucht einen neuen. EXAKT, nicht „mindestens".
 */
const AUSLEIH_FLAECHEN_ANZAHL = 5;

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
      // KEINE Ausnahme mehr (V11 Fix-Runde 2, N1): riegel.test.ts:190 wirft SQL/JSON ohnehin weg.
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

/*
 * ⛔ DIE DREITEILIGE BEREINIGUNG STEHT SEIT AUFGABE V11 IN `_lib/quelltextScan.ts` — sie
 * WIRD DORT IMPORTIERT (Kopf dieser Datei), NICHT HIER WIEDERHOLT. Entscheidung **E-V13**
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:852-937`): `admin/actions.test.ts` braucht
 * dieselbe Bereinigung, ein Import aus einer `.test.ts` ist ausgeschlossen (vitest laedt
 * Testdateien nicht als Module fuereinander; die Sonde zu E-V13 mass `Tests 3 passed (3)`
 * statt 2), und eine dritte handgeschriebene Kopie waere genau der Weg, auf dem M1
 * zurueckkehrt.
 *
 * ⛔ AUS DER HILFSDATEI KOMMEN NUR `ohneKommentare` UND `bereinigt`. Die zwei Zwischenstufen
 * sind dort modul-privat (Vorabscan-Fund F7) — ein Direktaufruf der ungeschuetzten Fassung
 * ist damit konstruktiv unmoeglich und nicht nur gezaehlt. Der Zaehlfall am Ende dieser
 * Datei prueft die Hilfsdatei weiterhin auf GENAU ZWEI Fundstellen; der Zaehlfall in
 * `admin/actions.test.ts` haelt die vier Scandateien zusaetzlich auf ihren Sollwert.
 */

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

  it("die zwei Huellen tragen JE IHRE Stufe, namentlich — die ODER-Klausel oben faengt das nicht", () => {
    /*
     * ⛔ ZUSAETZLICH ZU KLAUSEL (a), NICHT STATT IHRER — und der Grund ist die benannte
     * Blindstelle dieses ganzen Planteils (`KONTEXT.md`, „Die zwei Sperren", und
     * `personenRiegelFuer` oben): der Scan laesst im `(arbeit)`-Zweig `requireRadioAdmin(`
     * UND `requireRadioVerwaltung(` zu, und zwar ABSICHTLICH — ohne das ODER waere er gegen
     * Spec:4367 rot-by-construction. Damit faengt er eine faelschlich ABGESENKTE oder
     * ANGEHOBENE Huelle strukturell NICHT.
     *
     * ⛔ FUER DIE ZWEI HUELLEN IST DIE STUFE ABER EINZELN VERBINDLICH: Spec:4367 setzt
     * `(arbeit)/layout.tsx` auf `requireRadioVerwaltung()`, Spec:4368 laesst
     * `(druck)/layout.tsx` bei `requireRadioAdmin()` — dort liegen die Zugangscodes im
     * Klartext. Stuende in `(arbeit)` wieder der strengere Name, sperrte das Layout JEDE
     * Updater-Person mit 404, BEVOR eine Seite laeuft, und typecheck, lint und build blieben
     * gruen. Genau dieser Zustand bestand bis Aufgabe V3.
     *
     * ⚠️ NACHGETRAGEN IN V3 UND UEBER DEN BRIEF HINAUS (dort steht die namentliche
     * Zusicherung nur fuer die drei Admin-SEITEN, V18/V19/V20). Sie kostet diese Zeilen und
     * schliesst die einzige Stelle, an der der Riegelwechsel dieser Aufgabe sonst ohne jeden
     * Waechter stuende. ⛔ Sie WEICHT KEINE bestehende Klausel AUF: sie ist additiv und
     * strenger.
     */
    const arbeit = bereinigt(readFileSync(join(MODUL, "admin/(arbeit)/layout.tsx"), "utf8"));
    const druck = bereinigt(readFileSync(join(MODUL, "admin/(druck)/layout.tsx"), "utf8"));
    expect(arbeit, "(arbeit)/layout.tsx: Spec:4367 verlangt requireRadioVerwaltung()")
      .toMatch(/\brequireRadioVerwaltung\s*\(/);
    expect(arbeit, "(arbeit)/layout.tsx auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404")
      .not.toMatch(/\brequireRadioAdmin\s*\(/);
    expect(druck, "(druck)/layout.tsx: Spec:4368 laesst das Blatt mit den Zugangscodes auf der Admin-Stufe")
      .toMatch(/\brequireRadioAdmin\s*\(/);
    expect(druck, "(druck)/layout.tsx auf die Verwaltungs-Stufe abgesenkt — Zugangscodes im Klartext")
      .not.toMatch(/\brequireRadioVerwaltung\s*\(/);
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
     * ⚠️ HEUTE VIER, UND DAS IST EIN ZUSTAND, KEIN ZIEL. Planteil 2 baute keinen Route
     * Handler; Planteil 3 legte `t/[code]/route.ts` und `abmelden/route.ts` an, V18
     * `admin/(arbeit)/import/hochladen/route.ts` (E-V16), V22 `geraete/export/route.ts`.
     * Der Fahrplan im Kopf dieser Datei fuehrt sie weiter: Planteil 5 auf 5.
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
  // ⛔ `ADMIN_SEITEN()` STEHT SEIT DER FIX-RUNDE 1 ZU V15 AM DATEIENDE, module-scope: Klausel
  // (g) dort braucht denselben Filter. Warum am ENDE — der Schlussblock dieser Datei sagt es.

  it("die Seitenzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⚠️ HEUTE ACHT, UND DAS IST EIN ZUSTAND, KEIN ZIEL — dieselbe Form und derselbe Grund
     * wie bei `HANDLER_ANZAHL`. Er hat bei jeder Seitenaufgabe GEMESSEN gewirkt: in V12
     * („expected 1 to be +0"), V13 („expected 2 to be 1"), V14 („expected 3 to be 2"),
     * V15 („expected 4 to be 3"), V16 („expected 5 to be 4"), V17 („expected 6 to be 5"),
     * V18 („expected 7 to be 6") und V19 („expected 8 to be 7") — erst die Anhebung im selben
     * Commit machte ihn jeweils wieder gruen.
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
     * der ZWEITE Halter: beide werfenden Riegel rufen `requireRadioHost(kopf)` als ERSTE
     * ANWEISUNG (Spec:669-671) — seit V3 im gemeinsamen Helfer `riegelAufStufe`, und
     * Klausel (d) Fall 2 unten sichert genau das zu. Der Host wird also ENTWEDER vom
     * Group-Layout (Spec:4367-4368) ODER vom werfenden Personen-Riegel selbst gehalten.
     * ⛔ AUFLAGE AN PLANTEIL 4 — ✅ EINGELOEST IN V3: solange Klausel (d) Fall 2 nur
     * `requireRadioAdmin` las, galt diese zweite Haelfte fuer `requireRadioVerwaltung`
     * (Spec:4287) NICHT. Der Wortlaut bleibt als Auflage an JEDEN, der den Helfer noch einmal
     * umbaut: er schuldet ihm dieselben Koerper-Zusicherungen (heute `riegel.test.ts:667-687`).
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

  it("riegelAufStufe ruft ihn dagegen sehr wohl, und als ERSTE Anweisung", () => {
    /*
     * DIE GEGENPROBE ZUR GEGENREGEL, und sie gehoert unmittelbar daneben: ohne sie liesse
     * sich Klausel (d) erfuellen, indem man den Riegel aus BEIDEN Funktionen entfernt.
     * Server Actions haben kein Layout ueber sich (Spec:669-673, Kapitel-4-Pflicht 16).
     *
     * ⛔ UMGEZOGEN IN AUFGABE V3 (Planteil 4), GENAU WIE DIE AUFLAGE UNTEN ES VORSCHREIBT.
     * Bis dahin las dieser Fall den Koerper von `requireRadioAdmin`. Seit V3 tragen BEIDE
     * werfenden Riegel — `requireRadioAdmin` (Admin-Stufe) und `requireRadioVerwaltung`
     * (Verwaltungs-Stufe, Spec:4287-4288) — denselben privaten Helfer `riegelAufStufe`
     * (Entscheidung E-V1), und die vier Zusicherungen sind mit ihm GEWANDERT: nicht
     * geloescht, nicht zu einem dateiweiten `toMatch` aufgeweicht.
     * ⛔ `istRadioAdmin(` IST DABEI ZU `erlaubt(` GEWORDEN — das ist der Parameter, ueber den
     * die beiden Riegel ihre Stufe hineinreichen. Ein Helfer ohne diesen Aufruf prueft gar
     * keine Gruppe mehr.
     */
    const quelle = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    const koerper = funktionsKoerper(quelle, "riegelAufStufe");
    /*
     * ⛔ DIE LEER-GRUEN-PROBE IST HIER DIE TRAGENDE ZEILE, nicht eine Formalie: benennt
     * jemand den Helfer um, ohne diese Klausel nachzuziehen, liefert `funktionsKoerper` `""`
     * — und JEDES `toMatch` darunter waere dann rot, aber aus dem falschen Grund; ein
     * `not.toMatch` waere still gruen. Diese Zeile sagt, WAS kaputt ist.
     */
    expect(koerper, "riegelAufStufe nicht gefunden — der Scan waere leer-gruen").not.toBe("");
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
     * Import, `:72` Aufruf, Begruendung `:60-71`) gehoerten an PLANTEIL 4 — ✅ GEBAUT in
     * Aufgabe V3, sie stehen in `src/app/m/radio/_lib/zugang.test.ts` im Block
     * „requireRadioVerwaltung — die zweite Stufe, werfend". ⛔ Was AUCH DORT nicht steht, ist
     * die Wirkung bei einem ECHTEN Abruf: das war ⬜ V-L3 — ABGELESEN in V23, siehe `:50-88`.
     *
     * Warum genau diese vier: ohne `erlaubt(` prueft der Riegel keine Gruppe, ohne
     * `notFound(` weist er nicht ab (403 waere die falsche Form, Spec:691-694), ohne
     * `meldeFehlendeGruppe(` ist Falle 23 unsichtbar (Spec:206-210, „die einzige Stelle, an
     * der dieser Zustand ueberhaupt sichtbar wird"), und ohne `redirect(` landet eine
     * ANONYME Person im 404 statt in der Anmeldung — `viewerAusSession` gibt dort `null`,
     * und beide Praedikate sind auf `null` `false`.
     *
     * ⛔ AUFLAGE AN PLANTEIL 4 — ✅ EINGELOEST IN V3, der Wortlaut bleibt als BEGRUENDUNG stehen
     * und ist damit auch die Auflage an jeden, der den Helfer noch einmal umbaut: Spec:4287-4288
     * fuehrt `requireRadioAdmin` UND `requireRadioVerwaltung` in derselben Datei. Zwei werfende
     * Riegel mit fast gleichem Koerper sind der Lehrbuchfall, in dem jemand den gemeinsamen Teil
     * in einen Helfer zieht — und in dem Augenblick verlassen die vier Aufrufe den Koerper von
     * `requireRadioAdmin`, und diese Klausel faellt ueber KORREKTEM Code. Dann gilt: die vier
     * Zusicherungen WANDERN in den Koerper dieses Helfers (`funktionsKoerper(quelle, "<helfer>")`).
     * Sie werden NICHT geloescht und NICHT zu einem dateiweiten Scan aufgeweicht — ein
     * dateiweites `toMatch` waere ueber jeder Datei wahr, die die Namen irgendwo nennt, und das
     * ist genau die NT11-Form. (Dieselbe Richtung wie die `||`-Auflage in `_lib/zugang.ts`.)
     */
    expect(koerper, "ohne erlaubt( prueft der Riegel keine Gruppe — der Parameter TRAEGT die Stufe")
      .toMatch(/\berlaubt\s*\(/);
    expect(koerper, "ohne meldeFehlendeGruppe( ist Falle 23 unsichtbar (Spec:206-210)")
      .toMatch(/\bmeldeFehlendeGruppe\s*\(/);
    expect(koerper, "ohne notFound( weist der Riegel nicht ab (Spec:691-694)")
      .toMatch(/\bnotFound\s*\(/);
    expect(koerper, "ohne redirect( landet die anonyme Person im 404 statt in der Anmeldung")
      .toMatch(/\bredirect\s*\(/);
    const host = koerper.search(/\brequireRadioHost\s*\(/);
    const person = koerper.search(/\bviewerAusSession\s*\(/);
    expect(host, "erst der Host, dann die Person (Spec:669-671)").toBeLessThan(person);
    /*
     * ⛔ NEU IN V3, UND ES IST NS-Z7: `merkeNutzer(` steht NACH `erlaubt(`. Stuende die Zeile
     * davor, schriebe der Riegel fuer JEDE angemeldete Person der Suite eine `users`-Zeile —
     * auch fuer die, die er gleich darauf abweist. Der Verhaltensfall dazu steht in
     * `_lib/zugang.test.ts` („merkeNutzer wird NICHT gerufen, wenn der Riegel abweist");
     * diese Zeile haelt die BAUFORM, die er voraussetzt.
     */
    const merke = koerper.search(/\bmerkeNutzer\s*\(/);
    expect(merke, "ohne merkeNutzer( rendert jede Ereigniszeile eine nackte UUID (Spec:4358-4360)")
      .toBeGreaterThan(-1);
    expect(
      koerper.search(/\berlaubt\s*\(/),
      "merkeNutzer( steht VOR der Gruppenpruefung (NS-Z7)",
    ).toBeLessThan(merke);
  });

  it("beide werfenden Riegel gehen durch riegelAufStufe — keiner baut den Koerper zweimal", () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE DES UMZUGS, und ohne sie waere der Fall darueber ein Waechter
     * ueber einer Funktion, die niemand mehr ruft. `funktionsKoerper` liest je einen
     * FUNKTIONSKOERPER — ein dateiweites `toMatch` waere ueber jeder Datei wahr, die den
     * Namen irgendwo nennt (NT11-Form, `riegel.test.ts:635-638`).
     *
     * ⚠️ DESHALB TRAEGT `requireRadioVerwaltung` EINEN BENANNTEN RUECKGABETYP UND KEINE
     * INLINE-OBJEKTFORM: `funktionsKoerper` sucht die erste `{` nach dem Funktionsnamen
     * (`riegel.test.ts:209`). Bei `Promise<{ viewer: …; rolle: … }>` waere das die Klammer
     * des TYPS, und der Scan las den Typ statt des Rumpfs — rot-by-construction, und der
     * billige Gruen-Fix waere die Aufweichung.
     */
    const quelle = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    for (const name of ["requireRadioAdmin", "requireRadioVerwaltung"]) {
      const k = funktionsKoerper(quelle, name);
      expect(k, `${name} nicht gefunden — der Scan waere leer-gruen`).not.toBe("");
      expect(k, `${name} baut den Riegelkoerper selbst, statt riegelAufStufe zu rufen`)
        .toMatch(/\briegelAufStufe\s*\(/);
    }
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
   * nicht; siehe `riegel.test.ts:281-283` — dort steht woertlich, dass Klausel (a)
   * `src/app/m/radio/layout.tsx` NICHT faengt und ein Treffer dort rot-by-construction
   * waere. `riegel.test.ts:265-274` ist nur `inRouteGroup`.)
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

  /*
   * ⛔ `ersteAnweisungAus(...)` — DIE ERSTE ANWEISUNG IM RUMPF DER STANDARD-EXPORTIERTEN
   * FUNKTION, getrimmt bis zum ersten `;`. Der Helfer ist in der Fix-Runde 1 zu V15 AN DAS
   * DATEIENDE GEZOGEN, weil Klausel (g) dort denselben Schnitt braucht — eine zweite Kopie
   * waere genau die Fehlerform, gegen die R-V11-1 steht. Er ist unveraendert; nur sein Ort
   * hat sich geaendert, und Klausel (f) unten ruft ihn weiterhin.
   *
   * ⛔ WARUM AN DAS ENDE UND NICHT HIER NACH OBEN: Belegzeilen unter `src` und in den Plaenen
   * zeigen mit `riegel.test.ts:N` in diese Datei — ein Block, der oben einzieht, verschiebt sie
   * alle (WIE VIELE, steht bewusst nicht hier: REVIEW-V15, Fund N1). Der Ersatz
   * hier ist deshalb ZEILENZAHL-NEUTRAL — dieselbe Bauform, die R-V11-3 fuer eine Reparatur
   * in einer viel zitierten Datei vorschreibt (`progress.md`, Ruling R-V11-3, Schluss).
   * ⚠️ Dass das TRAEGT, ist eine Sprachaussage und keine Hoffnung: `function`-Deklarationen
   * werden an den Modulanfang gehoben, `const` nicht. Der Helfer unten ist deshalb eine
   * `function` — als Pfeilkonstante laege er hier in der TDZ, und (f) liefe vor ihm.
   *
   * ⛔ WARUM NICHT `funktionsKoerper` (`riegel.test.ts:205-220`): jener Helfer nimmt das
   * ERSTE `{` nach dem Funktionsnamen. Bei einem DESTRUKTURIERTEN Parameter ist das die
   * Parameterliste selbst — `GeraeteUebersichtPage({ searchParams }: …)` lieferte dort den
   * Rumpf des Parameterobjekts statt des Funktionsrumpfs, und der Scan verglicht still die
   * falsche Spanne. Die Fassung am Dateiende zaehlt deshalb Klammern: der Rumpf beginnt am
   * ersten `{` auf Klammertiefe 0, NACHDEM die Parameterliste geschlossen ist.
   *
   * ⚠️ ZWEI GRENZEN: (1) eine Rueckgabetyp-Annotation mit `{` traefe zu frueh; heute traegt
   * keine Flaeche eine; faellt das je an, faellt es LAUT (die Meldung druckt den Fund).
   * (2) ZEILE IST NICHT ANWEISUNG — zwei auf EINER waren 0 rot (REVIEW-A18, Fund N1): daher
   * der `;`-Schnitt. Beide Grenzen gelten fuer Klausel (f) UND fuer Klausel (g), die den
   * Helfer seit der Fix-Runde 1 zu V15 teilen.
   */

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
     * scannt sich selbst (`_lib/meldungen.test.ts:536-561`, Sonden M-G und M-L je 1 rot).
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
     * ⛔ `planteil3/briefs/KOPF.md:295` fuehrt diesen Namen in der Tafel (Ueberschrift `:281`) „Verbotene Namen und Muster
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
     * also nur AUSFUEHRBAREN Code (`riegel.test.ts:183-191`). Der Scan in
     * `_lib/code.test.ts` VERBIETET den Namen im ROHEN Quelltext, Kommentare
     * eingeschlossen (`_lib/code.test.ts:151-152`) — seine POSITIVE Haelfte liest dort
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
    /*
     * ⛔ DIE ZUSICHERUNG UEBER DEM ECHTEN TEXT IST HEUTE ZAHNLOS — GEMESSEN in der Fix-Runde 1
     * zu V11 (Fund 1, dort an `admin/actions.test.ts` erhoben; DIESER Fall ist sein Zwilling
     * und war ebenso blind). `_lib/zugang.ts` fuehrt kein mehrzeiliges Zeichenketten- oder
     * Template-Literal und keine Zeile, auf der ein `/` als Literalanfang gilt und dort nicht
     * schliesst. Es gibt in `_lib/quelltextScan.ts` genau ZWEI Zeilen, die die Zeilenzahl
     * ueberhaupt verschieben koennen — `_lib/quelltextScan.ts:122` und
     * `_lib/quelltextScan.ts:183` —, und beide Mutationen liefen ueber
     * dem echten Text GRUEN, ueber alle Testdateien des Moduls.
     *
     * ⛔ DESHALB DIESELBE SYNTHETISCHE SONDE WIE IN `admin/actions.test.ts`, Fall „die
     * Zeilenzahl bleibt erhalten". ⚠️ SIE IST EINE ZWEITE KOPIE, UND DAS IST BENANNT: die
     * zwei Scans koennen einander nichts importieren (vitest laedt Testdateien nicht als
     * Module fuereinander, E-V13), und die Sonde in die Hilfsdatei zu legen machte eine
     * Testvorlage zu Produktionscode. Zusammenlegen ist ⬜ **V-L9**.
     *
     *   1. ein Template-Literal ueber ZWEI Zeilen — `_lib/quelltextScan.ts:122` rettet
     *      dessen Zeilenumbruch beim Leeren;
     *   2. `x! / 2` — gueltiges TypeScript: `!` steht in `REGEX_ERLAUBT`
     *      (`_lib/quelltextScan.ts:162-163`), die Division gilt dem Scanner also als
     *      Literalanfang und schliesst auf ihrer Zeile nicht. Ohne
     *      `_lib/quelltextScan.ts:183` frisst er den Zeilenumbruch bis zum naechsten `/`.
     */
    const roh = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    expect(
      bereinigt(roh).split("\n").length,
      "_lib/zugang.ts: die Bereinigung verschiebt die Zeilenzahl",
    ).toBe(roh.split("\n").length);

    const SONDE_ZEILEN = [
      "export async function sondeZeilen(x: number, y: number): Promise<void> {",
      "  await requireRadioAdmin();",
      "  const text = `mehrzeilig",
      "  und weiter`;",
      "  const a = x! / 2;",
      "  const b = y! / 3;",
      "  await schreibe(text, a, b);",
      "}",
    ].join("\n");
    expect(
      bereinigt(SONDE_ZEILEN).split("\n").length,
      "die Sonde verliert eine Zeile — mehrzeiliges Literal oder Regexscanner ueber den Umbruch",
    ).toBe(SONDE_ZEILEN.split("\n").length);
  });

  it("kein Scan liest die ungeschuetzte Fassung direkt", () => {
    /*
     * ⛔ DER RIEGEL GEGEN DIE RUECKKEHR VON M1. `ohneKommentareUndZeichenketten` darf in
     * `_lib/quelltextScan.ts` genau zweimal vorkommen: in seiner eigenen Deklaration und in
     * `bereinigt`. Jede weitere Fundstelle ist ein Scan, der die Regexliterale wieder
     * ungeleert liest — und das faellt an einer negativen Zusicherung niemandem auf.
     *
     * ⛔ ER ZEIGT SEIT V11 AUF DIE HILFSDATEI UND NICHT MEHR AUF DIESE DATEI (E-V13). Die
     * ZAHL BLEIBT 2 — gemessen, nicht angenommen: die Deklaration und der eine Aufruf in
     * `bereinigt`. ⚠️ Fuer sich allein bewachte er nach dem Umzug nur noch die Hilfsdatei
     * (Vorabscan-Fund F7); die zweite Haelfte steht deshalb unmittelbar darunter, und der
     * Zaehlfall in `admin/actions.test.ts` deckt zusaetzlich die zwei alten Kopien ab.
     */
    // ⛔ UEBER `ohneKommentare` GELESEN, NICHT UEBER DEN ROHTEXT: eine blosse ERWAEHNUNG des
    // Namens in einem Kommentar der gelesenen Datei waere sonst eine weitere Fundstelle, und
    // der Fall waere rot mit einer Meldung, die etwas anderes behauptet — NT11 im Kleinen. Die
    // Nadel ist zusammengesetzt, weil das Literal selbst im gescannten Text steht.
    const nadel = "ohneKommentareUnd" + "Zeichenketten(";
    const quelle = readFileSync(join(MODUL, "_lib/quelltextScan.ts"), "utf8");
    const stellen = ohneKommentare(quelle).split(nadel).length - 1;
    expect(stellen, "ein Scan liest die ungeschuetzte Fassung direkt").toBe(2);

    /*
     * ⛔ DIE ZWEITE HAELFTE, UND SIE IST DER GRUND, WARUM DER UMZUG NICHTS VERLIERT: DIESE
     * Datei darf die Nadel gar nicht mehr fuehren. Vor V11 buergte die `2` dafuer, dass kein
     * Scan HIER die ungeschuetzte Fassung liest; nach dem Umzug taete sie das nicht mehr —
     * ein `riegel.test.ts`, das die Zwischenstufe importierte und direkt riefe, liesse den
     * Zaehler oben bei 2 und den Fall gruen. Der Import ist heute konstruktiv unmoeglich
     * (die Zwischenstufen sind in der Hilfsdatei nicht exportiert); diese Zeile haelt es
     * ausserdem GEMESSEN.
     */
    const hier = ohneKommentare(readFileSync(SELBST, "utf8")).split(nadel).length - 1;
    expect(hier, "diese Datei ruft die ungeschuetzte Fassung direkt").toBe(0);
  });
});

/*
 * ============================================================================================
 * DER SCHLUSSBLOCK — ZWEI HELFER UND EINE KLAUSEL, ANGEHAENGT IN DER FIX-RUNDE 1 ZU V15.
 *
 * ⛔ WARUM UNTEN UND NICHT OBEN BEI IHREN GESCHWISTERN: Belegzeilen unter `src` und in den
 * Plaenen zeigen mit `riegel.test.ts:N` in diese Datei; WIE VIELE, steht hier bewusst nicht
 * (REVIEW-V15, Fund N1) — Anhaengen verschiebt keine, ein Einzug oben alle. Dieselbe Bauform, die R-V11-3 fuer
 * eine Reparatur in einer viel zitierten Datei vorschreibt — die beiden Ersaetze weiter oben
 * (Klausel (e), Zeile des Filters; Klausel (f), Rumpf des Helfers) sind ZEILENZAHL-NEUTRAL.
 * ============================================================================================
 */

/**
 * Alle Verwaltungsflaechen unter `admin/**` — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
 * Bis zur Fix-Runde 1 zu V15 stand dieser Filter in Klausel (e); er speist jetzt AUCH
 * Klausel (g) unten, und eine zweite Kopie waere die Fehlerform, gegen die R-V11-1 steht.
 *
 * ⛔ SEIT DIESER RUNDE FASST ER AUCH `template.tsx` UND `default.tsx` (REVIEW-V15, Fund 3).
 * Gemessen: eine riegellose `admin/(arbeit)/geraete/[id]/ereignisse/template.tsx` lief unter
 * `riegel.test.ts`, `EreignisTabelle.test.tsx` und `_lib/bauform.test.ts` zusammen
 * `49 passed` — von KEINEM Waechter gedeckt, weil Klausel (a) `layout.tsx` filtert, diese
 * Menge `page.tsx` filterte und Klausel (f) `/admin/` ausschliesst. Klausel (f) fuehrt beide
 * Namen seit der Fix-Runde 1 zu A11 aus genau diesem Grund; fuer den `admin/`-Zweig wurde
 * dieselbe Erweiterung nie gemacht.
 *
 * ⛔ DER FILTER SPEIST DREI FAELLE — den Zaehlfall der Klausel (e), ihre Riegelschleife und
 * Klausel (g). Er verlangt damit auch von einem `template.tsx` den Personen-Riegel; das ist
 * unter der Zwei-Linien-Doktrin (Spec:4382-4386) richtig und eine bewusste Verschaerfung,
 * keine Kosmetik. ⚠️ `ADMIN_SEITEN_ANZAHL` ZAEHLT DESHALB NUR DIE `page.tsx` MIT — und zwar
 * GEMESSEN: `/usr/bin/find src/app/m/radio -name 'template.tsx' -o -name 'default.tsx'` ist
 * leer (nachgemessen in V16, 2026-08-25). Der Zaehlfall bleibt gruen, weil es heute keine
 * solche Datei gibt — nicht, weil der Filter sie nicht faende. ⚠️ Die Zahl selbst steht am
 * Dateianfang und waechst mit jeder Seitenaufgabe; sie hier ein zweites Mal auszuschreiben
 * hiesse, sie bei jeder Anhebung an zwei Stellen zu pflegen.
 */
function ADMIN_SEITEN(): string[] {
  return quellDateien().filter((p) =>
    /\/admin\/(?:.*\/)?(?:page|template|default)\.tsx$/.test(kurzPfad(p)),
  );
}

/**
 * Die ERSTE Anweisung im Rumpf der standard-exportierten Funktion — getrimmt, bis zum ersten
 * `;`. ⛔ Unveraendert aus Klausel (f) hierher gezogen; die Begruendung, warum nicht
 * `funktionsKoerper`, und die zwei Grenzen stehen dort, wo er stand (Klausel (f), oben).
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
      return (q.slice(i + 1).split("\n").map((r) => r.trim()).find((r) => r !== "") ?? "").split(";")[0]!.trim();
    }
  }
  return "";
}

describe("(g) auf jeder Verwaltungsseite steht der Riegel als ERSTE Anweisung", () => {
  it("keine Verwaltungsseite liest, bevor sie riegelt", () => {
    /*
     * ⛔ DIESE KLAUSEL EXISTIERT WEGEN EINER MESSUNG, NICHT WEGEN EINER SORGE (REVIEW-V15,
     * Fund 1). `await requireRadioVerwaltung();` in
     * `admin/(arbeit)/geraete/[id]/ereignisse/page.tsx` HINTER `const akte = geraet(db, id);`
     * zu schieben liess `riegel.test.ts` und `EreignisTabelle.test.tsx` zusammen
     * `35 passed (35)` — kein einziger Fall rot. Die Seite laese dann den Datensatz eines
     * fremden Geraets, bevor sie abbricht. Klausel (e) prueft die ANWESENHEIT des Riegels,
     * diese hier seine STELLUNG.
     *
     * ⛔ DIE FEHLERFORM IST IN DIESEM HAUS SCHON EINMAL TEUER GEMESSEN WORDEN, und die
     * Behebung stand seit A18 sechzig Zeilen weiter oben in DERSELBEN Datei: Klausel (f)
     * schreibt sie woertlich aus (`const zugang = await requireAusleihZugang(getDb());`
     * hinter `const geraete = geraeteMitLeihstand(getDb());` liess alle 435 Faelle gruen).
     * Klausel (e) hatte nichts Vergleichbares — dieselbe Zusage an zwei Stellen UNGLEICH
     * STRENG, und die schwaechere ist die, auf die sich ein Nachfolger beruft (REVIEW-Z56,
     * Fund N1). ⚠️ Die Luecke war GEERBT: V12, V13 und V14 trugen sie ebenso.
     *
     * ⛔ ZWEI ZWEIGE, UND DIE TEILUNG IST KEINE BEQUEMLICHKEIT — sonst waere die Klausel
     * ROT-BY-CONSTRUCTION. Klausel (e) verlangt von einer Seite AUSSERHALB jeder Route-Group
     * `requireRadioHost(` VOR dem Personen-Riegel (Spec:429-437). Verlangte diese Klausel
     * dort zugleich den Personen-Riegel als erste Anweisung, koennte keine solche Seite
     * beides erfuellen — zeichengleich die Fehlerform, die Klausel (e) und Klausel (f) im
     * Kopf beide benennen. Ausserhalb einer Group ist die erste Anweisung deshalb der
     * HOST-Riegel; die Reihenfolge der beiden haelt Klausel (e) weiterhin ueber `search(...)`.
     * ⚠️ Heute liegt jede Admin-Seite in einer Group; der zweite Zweig ist damit
     * ungemessen und faellt LAUT, sobald ihn jemand betritt (die Meldung druckt den Fund).
     *
     * ⬜ UND ER SCHLIESST DIE LUECKE DORT NUR HALB — das steht hier, statt eine Reichweite zu
     * behaupten, die nicht gemessen ist: ausserhalb einer Group sichert diese Klausel den
     * HOST-Riegel als erste Anweisung, Klausel (e) die REIHENFOLGE von Host und Person. Eine
     * Seite, die dazwischen liest (`requireRadioHost(kopf);` — `const akte = geraet(db, id);`
     * — `await requireRadioAdmin();`), bestuende beide. Das ist zeichengleich die Fehlerform
     * dieser Klausel, eine Ebene tiefer. ⚠️ HEUTE UNERREICHBAR: alle zehn Seiten, die
     * Spec:4369-4378 vorsieht, liegen in einer Route-Group (neun unter `(arbeit)`, eine unter
     * `(druck)`), und dort greift der erste Zweig vollstaendig. Wer je eine Seite ausserhalb
     * einer Group anlegt, schuldet dieser Klausel die zweite Anweisung. Eigentuemer: Planhalter.
     *
     * ⛔ GEPRUEFT WIRD DIE ERSTE ANWEISUNG UND NICHT „vor dem ersten `await`" — dieselbe
     * benannte Abweichung wie in Klausel (f): `geraet(db, id)` ist SYNCHRON, der erste
     * `await` bliebe auch nach der Verschiebung der Riegelaufruf, und der Waechter waere
     * still gruen. ⛔ UND KEINE NAMENSLISTE der Lesefunktionen: die veraltete mit jeder
     * neuen Abfrage (REVIEW-A18, Fund 2).
     *
     * ⚠️ LEER-GRUEN IST AUSGESCHLOSSEN, OHNE DASS HIER EINE ZWEITE ZAEHLUNG STEHT: Klausel
     * (e) haelt `ADMIN_SEITEN().length` auf `ADMIN_SEITEN_ANZAHL` (`:121`) ueber DERSELBEN
     * Menge. Faende der Filter nichts, waere jener Fall rot, bevor dieser leer laeuft.
     */
    const verstoesse: string[] = [];
    for (const pfad of ADMIN_SEITEN()) {
      const kurz = kurzPfad(pfad);
      const q = bereinigt(readFileSync(pfad, "utf8"));
      const erste = ersteAnweisungAus(q);
      const erwartet = inRouteGroup(kurz)
        ? { muster: personenRiegelFuer(kurz).muster, was: "der Personen-Riegel" }
        : { muster: /\brequireRadioHost\s*\(/, was: "requireRadioHost(" };
      if (!erwartet.muster.test(erste)) {
        verstoesse.push(
          `${kurz}: ${erwartet.was} ist nicht die ERSTE Anweisung (Spec:4369-4378) — dort steht: ${erste || "(kein Rumpf gefunden)"}`,
        );
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("(h) wer die Codeliste im Klartext liest, traegt die Admin-Stufe", () => {
  /*
   * ⛔ DIESE KLAUSEL SCHLIESST ⬜ **V20-L2**, und der Eigentuemer war namentlich V21
   * (`_lib/lesepfade/codes.ts:61-68`; `.superpowers/sdd/planteil4/BERICHT-V20.md:653-654`).
   * Der Wortlaut der Uebergabe steht dort: „wer `codesListe` importiert, nennt
   * `requireRadioAdmin`".
   *
   * ⛔ WARUM SIE GEBRAUCHT WIRD — GEMESSEN, NICHT GESORGT (REVIEW-V20, N6):
   * `/usr/bin/grep -rn "codesListe" src e2e` lieferte bis V21 genau EINEN Aufrufer. Der
   * Waechter darueber ist der Fall „V20: admin/(arbeit)/zugaenge/page.tsx nennt
   * requireRadioAdmin …" in `admin/actions.test.ts` — er prueft den LITERALEN Pfad DIESER
   * EINEN Seite, ⛔ NICHT DIE AUFRUFERKLASSE. Eine kuenftige `(arbeit)`-Flaeche, die
   * `codesListe` zoege, faellt durch kein Tor: `personenRiegelFuer` laesst dort
   * `requireRadioVerwaltung(` zu (`riegel.test.ts:256-266`), und damit saehe jede
   * Updater-Person jeden Zugangscode im Klartext.
   *
   * ⛔ WAS AUF DEM SPIEL STEHT, STEHT IN DER SPEC: der Code „wird EINMAL zurueckgegeben und
   * danach in der Verwaltungsliste im Klartext angezeigt und gedruckt" (`Spec:2180-2182`),
   * und `Spec:2249-2250` zieht die Folge — „die Codeliste IST das Geheimnis".
   *
   * ⛔ GEFUNDEN STATT AUFGEZAEHLT (R-V11-1): die Leser werden ueber den Modulbaum GESUCHT.
   * Eine feste Zweiertafel waere fuer genau die dritte Flaeche blind, gegen die diese
   * Klausel gebaut ist.
   *
   * ⚠️ DIE NEGATIVE HAELFTE GEHOERT NICHT HIERHER, und das ist eine Abgrenzung, keine
   * Auslassung: „nennt NICHT `requireRadioVerwaltung`" ist eine Aussage ueber die STUFE
   * einer benannten Seite und steht je Seite in `admin/actions.test.ts`. Diese Klausel sagt,
   * dass die Admin-Stufe ueberhaupt vorkommt — die Zusage aus ⬜ V20-L2, woertlich.
   */
  /**
   * ⛔ ZWEI FRAGEN NACHEINANDER, NICHT EINE IMPORTFORM — und das ist eine GEMESSENE
   * Verschaerfung (Fix-Runde 1 zu V21, Fund F1). Die erste Fassung zaehlte die IMPORTFORM
   * auf (`import\s+(?!type)\{…\}\s*from\s*"…codes"`) und war damit dieselbe Fehlerklasse
   * eine Ebene tiefer, gegen die R-V11-1 steht. ⛔ GEMESSEN AM 2026-08-26, je eine neue
   * Serverdatei OHNE jeden Riegel: `import * as lesepfad from "./_lib/lesepfade/codes"` +
   * `lesepfad.codesListe(db)` → `riegel.test.ts` **25 passed, 0 rot**; derselbe Zugriff ueber
   * `const { codesListe } = await import("./_lib/lesepfade/codes")` → ebenfalls **0 rot**.
   * Die mehrzeilige benannte Form war die einzige, die die alte Fassung fing.
   *
   * ⛔ FRAGE 1 — MEINT DIE DATEI DIESEN LESEPFAD? Der Modul-Spezifizierer wird ueber
   * `ohneKommentare` gesucht, denn er IST eine Zeichenkette und `bereinigt` leerte ihn.
   * `from`, ein nacktes `import "…"`, `import("…")` und `require("…")` sind damit in EINEM
   * Ausdruck gefangen, ohne dass die Klammerform je gelesen wird.
   *
   * ⛔ FRAGE 2 — NENNT SIE DEN WERT? `codesListe` wird ueber `bereinigt` gesucht, damit ein
   * blosses Vorkommen in einer Zeichenkette nicht zaehlt. ⛔ HIER FAELLT DER TYP-IMPORT
   * HERAUS, OHNE IHN AUSNEHMEN ZU MUESSEN: `admin/(arbeit)/zugaenge/CodeTabelle.tsx` zieht
   * `import type { CodeZeile }` — der Spezifizierer trifft, der Bezeichner `codesListe`
   * kommt in der Datei nicht vor. EIN TYP IST KEIN LESER (er wird vom Uebersetzer geloescht,
   * ruehrt keine Datenbank an und kann in einer `"use client"`-Datei gar keinen Riegel
   * rufen); die Zeilen bekommt die Insel als Props von der Server-Seite, und DIE riegelt.
   *
   * ⚠️ WAS AUCH DIESE FASSUNG NICHT SIEHT, benannt statt verschwiegen:
   *   1. `export * from "./codes"` — ein Weiterreichen OHNE den Bezeichner zu nennen.
   *   2. Ein `_lib`-Baustein, der `codesListe` KAPSELT und unter eigenem Namen anbietet:
   *      die aufrufende Flaeche nennt dann weder Spezifizierer noch Bezeichner. Das ist die
   *      transitive Klasse; die Zusage aus ⬜ V20-L2 lautet woertlich „wer `codesListe`
   *      IMPORTIERT", und mehr behauptet dieser Fall nicht.
   *   3. Ein Geschwister in `_lib/lesepfade/` mit `from "./codes"` (ohne `_lib/` im Pfad).
   *      ⛔ Absichtlich: eine Datei unter `_lib/` KANN diese Klausel gar nicht erfuellen —
   *      sie ruft keinen Riegel (Falle 6) —, ein Treffer dort waere ein unbehebbarer
   *      Verstoss statt eines Fundes. Sie faellt unter Punkt 2.
   */
  const SPEZIFIZIERER_CODES =
    /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'][^"']*_lib\/lesepfade\/codes["']/;

  /** Meint die Datei den Lesepfad UND nennt sie `codesListe` als Wert? */
  function liestCodesListe(roh: string): boolean {
    if (!SPEZIFIZIERER_CODES.test(ohneKommentare(roh))) return false;
    return /\bcodesListe\b/.test(bereinigt(roh));
  }

  /**
   * ⛔ EINE UNTERGRENZE, KEINE EXAKTE ZAHL. Sie belegt nur, dass der Scan ueberhaupt Leser
   * findet — ohne sie waere `toEqual([])` unten ueber einer leeren Menge leer-gruen, die
   * NT11-Fehlerklasse. ⛔ EXAKT waere hier falsch: ein dritter Leser ist erlaubt, solange er
   * die Stufe traegt. Heute sind es zwei: `admin/(arbeit)/zugaenge/page.tsx` (V20) und
   * `admin/(druck)/zugaenge/blatt/page.tsx` (V21).
   */
  const CODE_LESER_MINDESTENS = 2;

  it("jede Datei, die codesListe importiert, nennt requireRadioAdmin", () => {
    /*
     * ⛔ UEBER DEN IMPORT GESUCHT, NICHT UEBER DEN NAMEN: `_lib/lesepfade/codes.ts` selbst
     * traegt `codesListe` als DEKLARATION und wuerde sich sonst selbst als Leser melden —
     * ein Lesepfad ruft aber keinen Riegel (Falle 6, und `riegel.test.ts` verbietet unter
     * `_lib/` ohnehin beide Bauform-Direktiven). Der Import ist die Aufruferklasse.
     *
     * ⛔ ZWEI BEREINIGUNGSSTUFEN, UND DIE TEILUNG IST GEMESSEN — sie steht jetzt in
     * `liestCodesListe` oben: der SPEZIFIZIERER braucht `ohneKommentare`, weil `bereinigt`
     * jede Zeichenkette LEERT (mit ihm fand der Scan NULL Leser und der Fall war
     * rot-by-construction, 2026-08-26, erster Lauf). Der RIEGEL unten laeuft ueber
     * `bereinigt`, damit ein `"requireRadioAdmin("` in einer Zeichenkette nichts erfuellt.
     *
     * ⚠️ TESTDATEIEN SIND UEBER `quellDateien()` AUSGENOMMEN (`riegel.test.ts:144-159`):
     * `_lib/lesepfade/codes.test.ts` importiert `codesListe` und nennt keinen Riegel — als
     * Leser gezaehlt waere diese Klausel rot-by-construction. Testdateien werden nicht
     * ausgeliefert.
     */
    const leser = quellDateien().filter((pfad) => liestCodesListe(readFileSync(pfad, "utf8")));

    expect(
      leser.length,
      "kein Leser von codesListe gefunden — die Klausel darunter waere leer-gruen",
    ).toBeGreaterThanOrEqual(CODE_LESER_MINDESTENS);

    const verstoesse = leser
      .filter((pfad) => !/\brequireRadioAdmin\s*\(/.test(bereinigt(readFileSync(pfad, "utf8"))))
      .map((pfad) => `${kurzPfad(pfad)}: liest die Codeliste im Klartext ohne requireRadioAdmin( (Spec:2249-2250)`);

    expect(verstoesse).toEqual([]);
  });
});
