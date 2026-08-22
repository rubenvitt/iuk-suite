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
 *   Planteil 3 baut `t/[code]/route.ts` und `abmelden/route.ts`  -> HANDLER_ANZAHL = 2
 *   Planteil 4 baut `admin/(arbeit)/geraete/export/route.ts`     -> HANDLER_ANZAHL = 3
 *   Planteil 5 baut `sw.js/route.ts`                             -> HANDLER_ANZAHL = 4
 *
 *   Planteil 3 baut `page.tsx` und den Ausleihzweig — beide AUSSERHALB von `admin/`,
 *                                                    -> ADMIN_SEITEN_ANZAHL bleibt 0
 *   Planteil 4 baut die zehn Seiten aus Spec:4369-4378
 *                                                    -> ADMIN_SEITEN_ANZAHL = 10
 *
 * ⚠️ Die Klausel (a) darunter bleibt bei `toBeGreaterThanOrEqual` — dort ist die
 * Untergrenze richtig: sie wird bei 0 oder 1 Layout rot, und eine DRITTE Verwaltungs-Huelle
 * waere kein Fehler. Der Einwand gilt genau der Handler- und der Seitenzahl, nicht dem
 * `>=` als solchem.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");
const SELBST = join(MODUL, "riegel.test.ts");

/**
 * ⛔ HEUTE NULL — EXAKT, nicht „mindestens". Angehoben von Planteil 3 (2), Planteil 4 (3),
 * Planteil 5 (4). Die Konstante steht hier oben und nicht im Testkoerper, damit die
 * Aenderung EINE Zeile ist und im Diff auffaellt.
 */
const HANDLER_ANZAHL = 0;

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
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale geleert. Nur fuer die
 * POSITIVEN Nachweise noetig: `toMatch` behauptet, dass ein Muster VORKOMMT, und ein
 * String `"requireRadioAdmin("` als reiner Text erfuellte diese Behauptung sonst, OHNE
 * dass der Riegel je liefe — ein Scan, der still nichts faengt, und das ist die
 * gefaehrliche Richtung (`bauform.test.ts:164-176`).
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
  return ergebnis;
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
  const bereinigt = ohneKommentareUndZeichenketten(quelle);
  const start = bereinigt.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const auf = bereinigt.indexOf("{", start);
  if (auf === -1) return "";
  let tiefe = 0;
  for (let i = auf; i < bereinigt.length; i++) {
    if (bereinigt[i] === "{") tiefe++;
    else if (bereinigt[i] === "}") {
      tiefe--;
      if (tiefe === 0) return bereinigt.slice(auf, i + 1);
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
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
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
     * ⚠️ HEUTE NULL, UND DAS IST EIN ZUSTAND, KEIN ZIEL. Planteil 2 baut keinen Route
     * Handler.
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
     * werfenden Riegel den Scan GRUEN. Sie ist heute ueber null Handlern leer-gruen und
     * laeuft im Anhebe-Fahrplan darueber mit — ab Planteil 3 (`t/[code]/route.ts`,
     * `abmelden/route.ts`) ist sie scharf.
     */
    const verstoesse: string[] = [];
    for (const pfad of ROUTE_HANDLER()) {
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
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
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
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

describe('kein "use client" unter _lib/ und _db/', () => {
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
});

describe("kein eingebauter Pseudo-Zufall in diesem Modul", () => {
  it("findet keinen Aufruf der nicht-kryptografischen Standardquelle", () => {
    /*
     * ⛔ `KOPF.md:295` fuehrt diesen Namen in der Tafel (Ueberschrift `:281`) „Verbotene Namen und Muster
     * (modulweit, VON `riegel.test.ts` DURCHGESETZT)" — und bis zur Fix-Runde zu A2 stand
     * er dort ohne Durchsetzung: `grep -n "random"` auf diese Datei lieferte keinen
     * Treffer, der einzige Waechter war `_lib/code.test.ts` und der galt nur fuer EINE
     * Datei (Fund F3, `.superpowers/sdd/planteil3/REVIEW-A2.md:81`). Fiele der aus, haette
     * das Modul gegen vorhersagbare Codes gar nichts. A6, A8, A9 und A10 legen weitere
     * Dateien an; diese Klausel deckt sie ab dem ersten Tag.
     *
     * Der Schaden ist der aus Spec:2089-2091: die Standardquelle liefert Codes mit der
     * richtigen LAENGE und dem richtigen ALPHABET. Jeder Verhaltenstest bliebe gruen —
     * sichtbar wird der Fehler erst, wenn jemand die Ausgabe vorhersagt.
     *
     * ⚠️ DIESE KLAUSEL IST SCHWAECHER ALS DER SCAN IN `_lib/code.test.ts`, und das steht
     * hier, statt verschwiegen zu werden: `trefferAuf` liest ueber `ohneKommentare`, prueft
     * also nur AUSFUEHRBAREN Code (`riegel.test.ts:215-223`). Der Scan in
     * `_lib/code.test.ts` liest den ROHEN Quelltext und verbietet den Namen dort auch im
     * Kommentar. Die beiden ersetzen einander nicht: diese hier ist breit (alle
     * Modul-Dateien), jene ist tief (eine Datei, Kommentare eingeschlossen).
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
