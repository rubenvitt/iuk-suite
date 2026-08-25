// src/app/m/radio/admin/actions.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bereinigt, ohneKommentare } from "../_lib/quelltextScan";

/**
 * DER VIERTE QUELLTEXT-SCAN — UND DER EINZIGE WAECHTER DER AUFRUFTABELLE AUS §5.4.
 *
 * ⛔ WARUM ES IHN GIBT: `Spec:4244` legt alle Verwaltungs-Actions nach `admin/actions.ts`.
 * Der bestehende `_actions/`-Scan hat als `ORDNER` `src/app/m/radio/_actions`
 * (`_actions/guards.test.ts:33`) und SIEHT DIESE DATEI NICHT. `Spec:4853-4857` benennt den
 * Ersatz woertlich: „`admin/actions.test.ts` — Quelltext-Scan, und der einzige Waechter der
 * Aufruftabelle aus §5.4 … **kein anderes Gate sieht eine vergessene Zeile.**" Und
 * `Spec:4388-4390` sagt, warum kein anderes Tor einspringt: „**Eine vergessene Stelle ist
 * typkorrekt und lint-sauber.**"
 *
 * ⛔ ER ERSETZT `_actions/guards.test.ts` NICHT und aendert dort KEINE Zahl. Zwei Scans, weil
 * zwei Ordner. Ob die vier Scans dieses Moduls spaeter einer werden, ist ⬜ **V-L9** mit
 * Eigentuemer ClickUp-Board (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „Offen, aber
 * NICHT bau-blockierend") — kein Bauwert in diesem Fenster.
 *
 * ⛔ DIE DREITEILIGE BEREINIGUNG WIRD IMPORTIERT, NICHT KOPIERT (Entscheidung **E-V13**,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:852-937`). Sie ist hier LASTTRAGEND und nicht
 * zeremoniell: die Kernzusicherung dieses Scans ist NEGATIV (`toEqual([])`), und genau diese
 * Form schwaechte der Kommentarschnitt-Fehler still ab — „weniger gefundene Verstoesse,
 * still". Der Selbsttest weiter unten haelt das gemessen fest.
 *
 * ⚠️ WAS ER NICHT PRUEFT, UND WER ES TUT: das VERHALTEN der neun Actions. Das steht in
 * `admin/actions.verhalten.test.ts` (Aufgabe V10, Vorabscan-Fund F5) — mit eigener
 * migrierter Datei-DB und benannten Attrappen fuer `next/cache` und `next/navigation`. Ein
 * Quelltext-Scan kann darueber nichts zusichern, und er soll es auch nicht behaupten.
 */
const MODUL = join(process.cwd(), "src/app/m/radio");
const SELBST = join(MODUL, "admin/actions.test.ts");
const DATEI = join(MODUL, "admin/actions.ts");

/**
 * ⛔ HEUTE NEUN — EXAKT, nicht „mindestens". Die Begruendung ist zeichengleich die von
 * `HANDLER_ANZAHL` in `riegel.test.ts:65-77`: `laenge >= 0` ist fuer JEDE Liste wahr, es
 * gaebe also keine Mutation, die einen `>=`-Fall rot macht — und ueber einer leeren oder
 * geschrumpften Menge waere jeder Fall darunter LEER-GRUEN. Das ist die NT11-Fehlerklasse.
 *
 * ⛔ NEUN, NICHT ZEHN. `Spec:4663` fuehrt `importVorschauAction` als zehnte; nach
 * Entscheidung **E-V16** (`.superpowers/sdd/planteil4/briefs/KOPF.md:994-1045`) ist sie ein
 * Route Handler (`admin/(arbeit)/import/hochladen/route.ts`, Aufgabe V18) und entsteht hier
 * NICHT — sie nimmt eine hochgeladene Datei und traegt die nicht-werfende Riegelform.
 *
 * DER ANHEBE-FAHRPLAN, eine Auflage an die Nachfolger und keine Notiz — Form und
 * Begruendung wie `riegel.test.ts:82-96` und `_actions/guards.test.ts:67-90`:
 *
 *   V10 legt die neun Actions an                                    -> 9   ERLEDIGT
 *   V18 legt `import/hochladen/route.ts` an — ⛔ ein Route HANDLER,
 *       keine Action; diese Zahl bewegt sich dabei NICHT             -> 9
 *   eine ZEHNTE Action ist eine ENTSCHEIDUNG und keine Zeile im Diff -> bewusst anheben
 */
const ACTION_ANZAHL = 9;

/**
 * DIE AUFRUFTABELLE AUS §5.4, NAMENTLICH — `Spec:4655-4664`, um `importVorschauAction`
 * gekuerzt (E-V16).
 *
 * ⛔ NAMENTLICH UND NICHT GENERISCH: ein pfad- oder namensgenerischer Scan kann die
 * Zuordnung nicht erzeugen. `geraetAendernAction` und `notizAnfuegenAction` sind die zwei
 * Wege, die eine Updater-Person gehen darf (`Spec:4655-4664`); alle uebrigen sieben sind
 * Admin-Wege. ⛔ Eine Verschiebung zwischen den beiden Listen ist eine ENTSCHEIDUNG.
 *
 * ⚠️ DIE ZAHLEN SIND NACHGEZAEHLT, NICHT UEBERNOMMEN: „sechs und vier" waere falsch,
 * `Spec:4655-4664` fuehrt ACHT `requireRadioAdmin` und ZWEI `requireRadioVerwaltung` — mit
 * E-V16 faellt `importVorschauAction` heraus, bleiben SIEBEN und ZWEI.
 */
const ADMIN_ACTIONS = [
  "geraetAnlegenAction",
  "geraetLoeschenAction",
  "versionAnlegenAction",
  "versionZielSetzenAction",
  "versionLoeschenAction",
  "versionenSortierenAction",
  "importSchreibenAction",
] as const;

const VERWALTUNGS_ACTIONS = ["geraetAendernAction", "notizAnfuegenAction"] as const;

const RIEGEL_ADMIN = /\brequireRadioAdmin\s*\(/;
const RIEGEL_VERWALTUNG = /\brequireRadioVerwaltung\s*\(/;
const RIEGEL = /\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/;

/**
 * ⛔ DIE EINZIGE ZULAESSIGE FORM EINES LAUFZEIT-EXPORTS IN EINER `"use server"`-DATEI —
 * uebernommen aus `_actions/guards.test.ts:122` (dort REVIEW-A8 W2).
 *
 * ⛔ VERBIETEN STATT PRUEFEN: `export const x = async () => {}` ist in einer
 * `"use server"`-Datei eine vollwertige Server Action und fuer ein Muster, das nur
 * Deklarationen kennt, UNSICHTBAR. Die Deckung um jede weitere Form zu erweitern hiesse,
 * jede kuenftige Form mitzuraten; sie zu VERBIETEN macht die Luecke konstruktiv unmoeglich.
 *
 * Erlaubt bleiben nur `export type` und `export interface` — beide loescht der Uebersetzer,
 * sie koennen also gar keine Action sein. Das ist der Grund und nicht der Hausstil:
 * `admin/actions.ts` fuehrt vier davon (`Ergebnis`, `GeraetPatch`, `GeraetEingabe`,
 * `ImportBilanz`), ein pauschales Verbot waere rot-by-construction.
 */
const EXPORT_FORM = /^export\s+(?:type\b|interface\b|(?:async\s+)?function\s+\w+\s*\()/;

function quelle(): string {
  return readFileSync(DATEI, "utf8");
}

/**
 * ALLE `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv — ⛔ EINSCHLIESSLICH DER
 * TESTDATEIEN, und genau darin unterscheidet sie sich von `quellDateien` in
 * `riegel.test.ts:144-159`. Dort sind Testdateien mit Grund ausgenommen (sie nennen jeden
 * verbotenen Namen in ihren eigenen Mustern); HIER sind sie der Gegenstand: die zwei
 * unabhaengigen Kopien der Bereinigung liegen in `_lib/bauform.test.ts` und
 * `_actions/guards.test.ts`, und eine fuenfte Kopie entstuende wieder in einer Testdatei.
 *
 * ⛔ GEFUNDEN STATT AUFGEZAEHLT — das ist der ganze Zweck (Fix-Runde 1 zu V11, Fund 2). Die
 * Vorgaengerfassung hielt eine fest verdrahtete Vierertafel; eine FUENFTE Scandatei mit
 * eigener Kopie war fuer sie unsichtbar. Gemessen: eine solche Datei angelegt →
 * `Test Files 55 passed (55)`, kein einziger Fall rot.
 */
function alleModulDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // erzeugtes SQL/JSON, kein TypeScript
      treffer.push(...alleModulDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * ⛔ DIE UNTERGRENZE BELEGT NUR, DASS DER BAUM UEBERHAUPT GELESEN WURDE. Ohne sie liefe die
 * Tafel unten ueber einer leeren Fundmenge — und `toEqual` gegen eine nicht leere Sollliste
 * waere dann zwar rot, aber ein Walker, der nur die obersten zwei Ebenen laeuft, faende die
 * drei Sollstellen trotzdem (sie liegen alle auf Ebene 1 und 2) und uebersaehe eine tiefer
 * liegende fuenfte Kopie STILL.
 *
 * ⚠️ SIE IST BEWUSST KEINE EXAKTE ZAHL: gemessen sind am 2026-08-25 **120** Dateien, und
 * jede Seitenaufgabe V12..V23 legt weitere an. Eine exakte Zahl waere eine Konstante, die
 * zehnmal ohne Erkenntnisgewinn angehoben wuerde; die Vollzaehligkeit traegt die Tafel
 * unten, nicht diese Zeile.
 */
const MODUL_DATEIEN_MINDESTENS = 100;

/**
 * DIE GRENZEN DES FUNKTIONSRUMPFES: Index der oeffnenden `{` und Index der zugehoerigen
 * schliessenden `}` — gezaehlt, nicht geraten.
 *
 * ⛔ UEBERNOMMEN AUS `_actions/guards.test.ts:297-367` (dort die Behebung von REVIEW-A8 W1),
 * und der Fund war GEMESSEN: endete der Koerper am NAECHSTEN `export`, wurde eine nicht
 * exportierte Hilfsfunktion HINTER einer ungeriegelten Action deren Koerper zugeschlagen,
 * und ihr Riegel erfuellte die Behauptung fuer die Action. ⚠️ Der Fall „der Koerper endet an
 * der Rumpfklammer" weiter unten haelt das an einer synthetischen Sonde fest.
 *
 * ⚠️ WARUM SIE HIER STEHT UND NICHT IN `_lib/quelltextScan.ts`: E-V13 verschiebt genau DREI
 * Funktionen — die dreiteilige Bereinigung. Diese Zerlegung ist keine davon; sie in dieselbe
 * Datei zu ziehen aenderte den Zaehlfall, der die Hilfsdatei auf zwei Fundstellen haelt.
 * ⬜ V-L9 ist der Ort, an dem das entschieden wird.
 *
 * `abParamAuf` steht HINTER der oeffnenden `(` der Parameterliste. Drei Abschnitte:
 *   1. die Parameterliste ueberspringen,
 *   2. die Rueckgabe-Annotation ueberspringen — sie darf `{` enthalten, aber nur INNERHALB
 *      von `<…>`, `(…)` oder `[…]`; `Promise<Ergebnis<{ id: string }>>` ist genau das,
 *   3. ab der Rumpfklammer bis zu ihrer Partnerin zaehlen.
 *
 * ⛔ KEIN STILLER RUECKFALL: laesst sich der Rumpf nicht bestimmen, ist das ein VERSTOSS und
 * kein „dann eben bis zum naechsten export". Genau dieser Rueckfall WAR W1.
 */
function rumpfGrenzen(q: string, abParamAuf: number): { auf: number; zu: number } | null {
  let runde = 1;
  let i = abParamAuf;
  while (i < q.length && runde > 0) {
    if (q[i] === "(") runde++;
    else if (q[i] === ")") runde--;
    i++;
  }
  if (runde !== 0) return null;

  let eckig = 0;
  let spitz = 0;
  runde = 0;
  let auf = -1;
  while (i < q.length) {
    const z = q[i]!;
    if (z === "(") runde++;
    else if (z === ")") runde--;
    else if (z === "[") eckig++;
    else if (z === "]") eckig--;
    else if (z === "<") spitz++;
    else if (z === ">" && spitz > 0) spitz--;
    else if (runde === 0 && eckig === 0 && spitz === 0) {
      // Eine `;` auf oberster Ebene vor jeder `{` heisst: die Deklaration hat keinen Rumpf
      // (Ueberladungssignatur). Das ist in einer `"use server"`-Datei keine gueltige Form.
      if (z === ";") return null;
      if (z === "{") { auf = i; break; }
    }
    i++;
  }
  if (auf === -1) return null;

  let geschweift = 0;
  for (let j = auf; j < q.length; j++) {
    if (q[j] === "{") geschweift++;
    else if (q[j] === "}") {
      geschweift--;
      if (geschweift === 0) return { auf, zu: j };
    }
  }
  return null;
}

/**
 * Die ERSTE ANWEISUNG eines Rumpfes: alles bis einschliesslich des ersten `;` auf oberster
 * Ebene, oder — falls eine Blockform (`if`, `try`, `for`) frueher kommt — bis zu deren `{`.
 *
 * ⛔ UEBERNOMMEN AUS `_actions/guards.test.ts:369-428` (dort die Behebung von REVIEW-A8 W3).
 * Der Fund war gemessen: der Kommentar versprach „der Riegel ist die ERSTE Anweisung",
 * geprueft wurde nur die Reihenfolge gegen `formData.get` — eine Action, die erst SCHREIBT
 * und danach riegelt, lief gruen durch. ⛔ „ERSTE ANWEISUNG" IST HIER NICHT „KOMMT VOR":
 * `Spec:4382-4386` sagt woertlich, „wer sie fuer doppelt haelt und entfernt, oeffnet die
 * Luecke, gegen die der Riegel gebaut ist".
 *
 * ⛔ KEIN STILLER FREISPRUCH AM ENDE: laesst sich kein Abschluss auf oberster Ebene finden,
 * ist das `null` und damit ein Verstoss. Gab diese Stelle den GANZEN Rumpf zurueck, galt ein
 * beliebig weit hinten stehender Riegel als „erste Anweisung".
 */
function ersteAnweisung(rumpf: string): string | null {
  let runde = 0;
  let eckig = 0;
  let geschweift = 0;
  for (let i = 0; i < rumpf.length; i++) {
    const z = rumpf[i]!;
    if (z === "(") runde++;
    else if (z === ")") runde--;
    else if (z === "[") eckig++;
    else if (z === "]") eckig--;
    else if (z === "}") geschweift--;
    else if (z === "{") {
      /*
       * ⛔ EINE `{` AUF OBERSTER EBENE IST ZWEIERLEI, UND DIE VERWECHSLUNG WAERE STILL: bei
       * `const { viewer, rolle } = await requireRadioVerwaltung()` gehoert sie zur BINDUNG
       * und die Anweisung laeuft weiter; bei `if (…) {` beginnt sie einen BLOCK, und dann
       * ist die erste Anweisung eben dieser Block. Wer beides gleich behandelt, laesst einen
       * Riegel IM zweiten Block als „erste Anweisung" durchgehen.
       *
       * ⚠️ DIE LISTE `=`/`const`/`let`/`var` IST BEWUSST KURZ, UND IHRE LUECKEN GEHEN ALLE IN
       * DIE STRENGE RICHTUNG: die erste Anweisung wird dadurch kuerzer, nie laenger — LAUT,
       * nicht still.
       */
      const davor = rumpf.slice(0, i).trimEnd();
      const bindung = /(?:=|\b(?:const|let|var))$/.test(davor);
      if (geschweift === 0 && runde === 0 && eckig === 0 && !bindung) {
        return rumpf.slice(0, i + 1);
      }
      geschweift++;
    } else if (runde === 0 && eckig === 0 && geschweift === 0 && z === ";") {
      return rumpf.slice(0, i + 1);
    }
  }
  return null;
}

/**
 * Die exportierten FUNKTIONEN der Datei, je mit Koerper und Rumpf.
 *
 * ⛔ GEZAEHLT WIRD JE DEKLARATION, NIE UEBER EIN `Set` DER NAMEN: zwei gleichnamige
 * Deklarationen fielen sonst zu einer zusammen, und eine bliebe unbewacht.
 *
 * ⛔ `koerper` ENDET AN DER RUMPFKLAMMER, NICHT AM NAECHSTEN `export` (W1). Ist der Rumpf
 * nicht bestimmbar, traegt der Eintrag `rumpf: null` — der Aufrufer meldet das als Verstoss.
 */
function exportierteActions(
  text: string,
): { name: string; koerper: string; rumpf: string | null }[] {
  const q = bereinigt(text);
  const treffer = [...q.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)\s*\(/g)];
  return treffer.map((t) => {
    const grenzen = rumpfGrenzen(q, t.index! + t[0].length);
    if (!grenzen) return { name: t[1]!, koerper: "", rumpf: null };
    return {
      name: t[1]!,
      koerper: q.slice(t.index!, grenzen.zu + 1),
      rumpf: q.slice(grenzen.auf + 1, grenzen.zu),
    };
  });
}

/**
 * DIE KERNZUSICHERUNG ALS FUNKTION, damit sie ueber dem ECHTEN Text und ueber einer SONDE
 * dieselbe ist: jede exportierte Action nennt einen der beiden Personen-Riegel als ERSTE
 * Anweisung.
 */
function riegelVerstoesse(text: string): string[] {
  const verstoesse: string[] = [];
  for (const { name, koerper, rumpf } of exportierteActions(text)) {
    if (rumpf === null) {
      verstoesse.push(`${name}: Rumpf nicht bestimmbar — der Scan kann hier nichts zusichern`);
      continue;
    }
    const erste = ersteAnweisung(rumpf);
    if (erste === null) {
      verstoesse.push(
        `${name}: erste Anweisung nicht bestimmbar — der Scan kann hier nichts zusichern`,
      );
      continue;
    }
    if (!RIEGEL.test(koerper)) {
      verstoesse.push(`${name}: weder requireRadioAdmin( noch requireRadioVerwaltung( (Spec:4382-4386)`);
    } else if (!RIEGEL.test(erste)) {
      verstoesse.push(`${name}: der Riegel ist nicht die ERSTE Anweisung (Spec:4382-4386)`);
    }
  }
  return verstoesse;
}

describe("radio-admin/actions: die Aufruftabelle aus Spec 1 §5.4", () => {
  it("die Datei existiert und fuehrt GENAU NEUN exportierte Actions", () => {
    /*
     * ⛔ DIE EXISTENZPFLICHT UND DIE EXAKTE ZAHL IN EINEM FALL. Ohne sie liefe alles darunter
     * ueber einer leeren Menge gruen und bewachte nichts. Begruendung der Zahl und der
     * Anhebe-Fahrplan: `ACTION_ANZAHL` im Kopf dieser Datei.
     */
    expect(existsSync(DATEI), "admin/actions.ts fehlt — jeder Fall darunter waere leer-gruen")
      .toBe(true);
    const namen = exportierteActions(quelle()).map((a) => a.name);
    expect(namen.length, "ACTION_ANZAHL anheben — Fahrplan im Kopf dieser Datei")
      .toBe(ACTION_ANZAHL);
  });

  it("admin/actions.ts traegt use server als erste Zeile", () => {
    /*
     * Ohne die Direktive ist keine der neun eine Action — der Aufruf aus einer Insel schluege
     * erst zur LAUFZEIT fehl oder zoege, schlimmer, Servercode ins Bundle.
     *
     * ⛔ GEPRUEFT WIRD DIE ERSTE ZEILE, UND DAS IST ABSICHT — dieselbe Form wie
     * `_actions/guards.test.ts:699-718`. Ein Pfadkommentar davor faerbt diesen Scan rot, und
     * der naheliegende „Fix", ihn auf fuehrende Kommentare aufzuweichen, ist der falsche.
     * `admin/actions.ts:1` traegt die Direktive deshalb ohne Pfadkommentar darueber.
     */
    const erste = quelle().trimStart().split("\n")[0]!.trim();
    expect(erste, 'admin/actions.ts: keine "use server"-Direktive in Zeile 1')
      .toMatch(/^["']use server["'];?$/);
  });

  it("jede exportierte Action nennt ihren Personen-Riegel als ERSTE Anweisung", () => {
    /*
     * ⛔ DIE KERNZUSICHERUNG, UND SIE IST NEGATIV (`toEqual([])`). Es gibt kein Layout ueber
     * einer Server Action (`Spec:4382-4386`): „Die Zeile in jeder Action ist ebenfalls keine
     * Redundanz — wer sie fuer doppelt haelt und entfernt, oeffnet die Luecke, gegen die der
     * Riegel gebaut ist."
     *
     * ⛔ ERSTE ANWEISUNG, NICHT „KOMMT VOR" — Vorbild `_actions/guards.test.ts` W3. Eine
     * Action, die erst schreibt und danach riegelt, hat den Schaden bereits angerichtet.
     */
    expect(riegelVerstoesse(quelle())).toEqual([]);
  });

  it("der Koerper endet an der Rumpfklammer, nicht am naechsten export", () => {
    /*
     * ⛔ DIE SONDE IST SYNTHETISCH UND STEHT ABSICHTLICH NICHT IM BAUM: `admin/actions.ts`
     * fuehrt heute keine ungeriegelte Action, ein Fall ueber dem echten Text waere hier also
     * leer-gruen und bewachte nichts. Der Fund, gegen den er steht, ist gemessen
     * (REVIEW-A8 W1): eine nicht exportierte Hilfsfunktion HINTER einer ungeriegelten Action
     * wurde deren Koerper zugeschlagen, und ihr Riegel erfuellte die Behauptung fuer die
     * Action — `Tests 4 passed (4)` gruen.
     */
    const SONDE_W1 = [
      "export async function sondeOhneRiegel(id: string): Promise<void> {",
      "  await schreibe(id);",
      "}",
      "",
      "async function hilfsRiegel(): Promise<void> {",
      "  await requireRadioAdmin();",
      "}",
    ].join("\n");

    const gefunden = exportierteActions(SONDE_W1).find((a) => a.name === "sondeOhneRiegel");
    expect(gefunden, "die Sonde wurde gar nicht erst gefunden").toBeDefined();
    expect(gefunden!.koerper, "der Koerper reicht in die Hilfsfunktion dahinter hinein")
      .not.toMatch(RIEGEL_ADMIN);
    expect(riegelVerstoesse(SONDE_W1)).toEqual([
      "sondeOhneRiegel: weder requireRadioAdmin( noch requireRadioVerwaltung( (Spec:4382-4386)",
    ]);
  });

  it("keine andere Laufzeit-Exportform als export async function", () => {
    /*
     * ⛔ VERBIETEN, NICHT PRUEFEN — Vorbild `_actions/guards.test.ts` W2 und die Begruendung
     * an `EXPORT_FORM` im Kopf dieser Datei. `export const x = async () => {}` ist in einer
     * `"use server"`-Datei eine gueltige Server Action und waere fuer den Fall darueber
     * unsichtbar: `exportierteActions` findet nur Deklarationen.
     *
     * ⚠️ WARUM DAS NICHT LEER-GRUEN LAUFEN KANN, obwohl hier keine eigene Untergrenze steht:
     * die Zahl der Deklarationen ist im ersten Fall EXAKT gezaehlt. Faende dieser Block
     * nichts, waere jener rot.
     */
    const q = bereinigt(quelle());
    const verstoesse: string[] = [];
    for (const treffer of q.matchAll(/\bexport\b/g)) {
      const ausschnitt = q.slice(treffer.index!, treffer.index! + 160).replace(/\s+/g, " ");
      if (!EXPORT_FORM.test(ausschnitt)) {
        verstoesse.push(
          `${ausschnitt.slice(0, 60).trim()} — nur \`export [async] function Name(\`, ` +
            "`export type` und `export interface` sind hier zulaessig",
        );
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("die sieben Admin-Actions nennen requireRadioAdmin, die zwei uebrigen requireRadioVerwaltung", () => {
    /*
     * ⛔ NAMENTLICH JE ACTION, UND ZWEI `toBe` STATT EINEM. Die Zuordnung steht in
     * `Spec:4655-4664` (um `importVorschauAction` gekuerzt, E-V16); ein pfad- oder
     * namensgenerischer Scan kann sie nicht erzeugen.
     *
     * ⛔ DIE ZWEI ZAHLEN WERDEN AUS DER DATEI GEZAEHLT, NICHT AUS DEN LISTEN OBEN — ein
     * `expect(ADMIN_ACTIONS.length).toBe(7)` waere gegen JEDE Absenkung blind. Gezaehlt wird
     * die ERSTE ANWEISUNG, dieselbe Ebene, auf der die Kernzusicherung liest.
     *
     * ⚠️ UND WAS SIE TROTZDEM NICHT SIND: eine eigene Deckung. GEGEBEN die Zusicherungen
     * darueber sind die zwei `toBe` REDUNDANT — das ist bewiesen und nicht vermutet
     * (Fix-Runde 1 zu V11, Fund 8): die Vollzaehligkeitszeile erzwingt neun Namen, jeden
     * genau einmal; die zwei Schleifen darunter erzwingen fuer jeden der sieben
     * `toMatch(RIEGEL_ADMIN)` UND `not.toMatch(RIEGEL_VERWALTUNG)` und fuer die zwei das
     * Umgekehrte. Damit MUSS `aufAdmin` 7 und `aufVerwaltung` 2 sein; es gibt keinen Zustand,
     * in dem eine der zwei Zeilen rot wird und alles darueber gruen bleibt. Sie stehen hier,
     * weil `briefs/V11.md` sie woertlich verlangt und weil sie die Zahl im Diff SICHTBAR
     * halten — ⛔ nicht, weil sie eine eigene Mutationsklasse faengen.
     *
     * ⛔ UND DIE VOLLZAEHLIGKEIT: die Vereinigung beider Listen muss die exportierten Namen
     * ZEICHENGLEICH treffen. Ohne sie koennte eine zehnte Action an beiden Listen vorbei
     * laufen und nur den Zaehlfall ganz oben rot machen — mit einer Meldung, die etwas
     * anderes behauptet.
     */
    const actions = exportierteActions(quelle());
    expect([...actions.map((a) => a.name)].sort()).toEqual(
      [...ADMIN_ACTIONS, ...VERWALTUNGS_ACTIONS].slice().sort(),
    );

    /*
     * ⚠️ DIE `Map` FASST GLEICHNAMIGE DEKLARATIONEN ZUSAMMEN — sie ist damit die eine Stelle
     * dieser Datei, an der der Satz aus dem Kopf von `exportierteActions` — „GEZAEHLT WIRD JE
     * DEKLARATION, NIE UEBER EIN `Set` DER NAMEN" — nicht gilt. Dass es keine gleichnamigen
     * gibt, halten der Zaehlfall ganz oben und die Vollzaehligkeitszeile darueber: GEMESSEN
     * (Fix-Runde 1 zu V11, Fund 10) macht eine zehnte, korrekt geriegelte Deklaration
     * desselben Namens beide rot (`expected 10 to be 9` und die Namensliste), diese Zeile
     * dagegen nicht.
     */
    const ersteVon = new Map<string, string>();
    for (const { name, rumpf } of actions) {
      const erste = rumpf === null ? null : ersteAnweisung(rumpf);
      expect(erste, `${name}: erste Anweisung nicht bestimmbar`).not.toBeNull();
      ersteVon.set(name, erste!);
    }

    for (const name of ADMIN_ACTIONS) {
      const erste = ersteVon.get(name);
      expect(erste, `${name}: nicht in admin/actions.ts gefunden`).toBeDefined();
      expect(erste!, `${name}: die Admin-Stufe fehlt als erste Anweisung (Spec:4655-4664)`)
        .toMatch(RIEGEL_ADMIN);
      expect(erste!, `${name}: faelschlich auf die Verwaltungs-Stufe abgesenkt (Spec:4655-4664)`)
        .not.toMatch(RIEGEL_VERWALTUNG);
    }
    for (const name of VERWALTUNGS_ACTIONS) {
      const erste = ersteVon.get(name);
      expect(erste, `${name}: nicht in admin/actions.ts gefunden`).toBeDefined();
      expect(erste!, `${name}: die Verwaltungs-Stufe fehlt als erste Anweisung (Spec:4655-4664)`)
        .toMatch(RIEGEL_VERWALTUNG);
      expect(erste!, `${name}: faelschlich auf die Admin-Stufe angehoben (Spec:4655-4664)`)
        .not.toMatch(RIEGEL_ADMIN);
    }

    const aufAdmin = [...ersteVon.values()].filter((e) => RIEGEL_ADMIN.test(e)).length;
    const aufVerwaltung = [...ersteVon.values()].filter((e) => RIEGEL_VERWALTUNG.test(e)).length;
    expect(aufAdmin, "SIEBEN Actions auf der Admin-Stufe (Spec:4655-4664)").toBe(7);
    expect(aufVerwaltung, "ZWEI Actions auf der Verwaltungs-Stufe (Spec:4655-4664)").toBe(2);
  });
});

describe("radio-admin/actions: die Rechtestufe je Verwaltungsseite", () => {
  /*
   * ⛔ WARUM DIESE VIER FAELLE HIER STEHEN UND NICHT IN `riegel.test.ts`: dessen Klauseln (a)
   * und (e) lassen im `(arbeit)`-Zweig `requireRadioAdmin(` ODER `requireRadioVerwaltung(`
   * zu, und zwar ABSICHTLICH (`riegel.test.ts:225-251`, Auswertung in `riegel.test.ts:253-262`) — ohne das
   * ODER waeren sie gegen `Spec:4367` rot-by-construction. Damit faengt der Scan eine
   * fehlende Zeile, aber eine faelschlich ABGESENKTE Seite STRUKTURELL NICHT. Diese vier
   * Faelle sind der einzige Waechter dagegen.
   *
   * ⛔ ES SIND VIER UND NICHT DREI. Der Plan sah `versionen`, `zugaenge` und
   * `(druck)/zugaenge/blatt` vor; die Betreiberentscheidung **V-L5** vom 2026-08-24
   * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L5") stellt `/admin/import`
   * ebenfalls auf die ADMIN-Stufe und ueberholt damit `Spec:4375`. Der Zaehlfall unten steht
   * deshalb auf VIER, nicht auf drei (Vorabscan-Fund F1).
   *
   * ⛔ SIE SIND `it.todo` UND KEINE GRUENEN FAELLE UEBER `null`. Heute existiert unter
   * `admin/` KEINE `page.tsx`; ein Fall, der das schweigend hinnaehme, waere leer-gruen und
   * bewachte nichts — dieselbe NT11-Klasse, gegen die `ACTION_ANZAHL` oben steht. Eine
   * `it.todo` meldet sich dagegen in JEDER Ausgabe.
   *
   * ⛔ AUFLAGE AN DIE NACHFOLGER — je Aufgabe genau ein Fall, im SELBEN Commit wie die Seite:
   *
   *   V18 baut `admin/(arbeit)/import/page.tsx`         -> Fall 1 scharf stellen
   *   V19 baut `admin/(arbeit)/versionen/page.tsx`      -> Fall 2 scharf stellen
   *   V20 baut `admin/(arbeit)/zugaenge/page.tsx`       -> Fall 3 scharf stellen
   *   V21 baut `admin/(druck)/zugaenge/blatt/page.tsx`  -> Fall 4 UND den Zaehlfall
   *
   * ⚠️ JEDE DER VIER MUSS DIESE DATEI IN IHRER Files-ZEILE UND IHREM `rtk git add` FUEHREN —
   * sonst kann sie ihren eigenen Fall nicht scharf stellen. ⛔ ES FEHLT NUR BEI **V18**, und
   * das ist nachgemessen (Fix-Runde 1 zu V11, Fund 6; roher `/usr/bin/grep -n` ueber die vier
   * Briefe): `briefs/V19.md:5` und `briefs/V19.md:78`,
   * `briefs/V20.md:5` und `briefs/V20.md:77`, `briefs/V21.md:5` und `briefs/V21.md:68`
   * fuehren sie bereits in beiden Bloecken; `briefs/V18.md` nennt sie NULLMAL. Die
   * Quelle sagt genau das — `.superpowers/sdd/planteil4/VORABSCAN.md:56-58` (F1, Punkt 4)
   * nennt ausschliesslich V18. ⚠️ `BERICHT-V11.md`s Auflage 1 verallgemeinerte den Fund auf
   * alle vier; richtiggestellt im Anhang „Fix-Runde 1" desselben Berichts.
   *
   * ⛔ DIE FORM JEDES SCHARFEN FALLES, damit sie nicht viermal auseinanderlaeuft — der
   * LITERALE Pfad, BEIDE Haelften, und die erste Anweisung, nicht „kommt vor":
   *
   *     const q = bereinigt(readFileSync(join(MODUL, "<literaler Pfad>"), "utf8"));
   *     expect(q, "<Pfad>: die Admin-Stufe fehlt").toMatch(RIEGEL_ADMIN);
   *     expect(q, "<Pfad>: faelschlich abgesenkt").not.toMatch(RIEGEL_VERWALTUNG);
   *
   * ⛔ DIE NEGATIVE HAELFTE IST NICHT UEBERFLUESSIG: `personenRiegelFuer`s strenger Zweig
   * prueft nur die ANWESENHEIT von `requireRadioAdmin(` (`riegel.test.ts:253-262`) — eine
   * Seite mit `requireRadioVerwaltung()` als erster Anweisung und einem `requireRadioAdmin()`
   * irgendwo darunter bestuende ihn.
   */
  it.todo(
    "V18: admin/(arbeit)/import/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung (V-L5)",
  );
  it.todo(
    "V19: admin/(arbeit)/versionen/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung",
  );
  it.todo(
    "V20: admin/(arbeit)/zugaenge/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung",
  );
  it.todo(
    "V21: admin/(druck)/zugaenge/blatt/page.tsx liegt in (druck) und nennt requireRadioAdmin, NICHT requireRadioVerwaltung",
  );
  it.todo(
    "V21: genau VIER Verwaltungsseiten nennen requireRadioAdmin — toBe(4), nie >= (V-L5, Vorabscan-Fund F1)",
  );
});

describe("die Bereinigung selbst — der Waechter ueber dem Waechter", () => {
  /*
   * ⛔ DIESER BLOCK PRUEFT NICHT `admin/actions.ts`, SONDERN DEN SCAN. Ohne ihn ist die
   * Uebernahme der dreiteiligen Reparatur eine BEHAUPTUNG. Vorbild `riegel.test.ts`, Block
   * „die Bereinigung selbst".
   *
   * ⛔ DIE QUELLEN SIND SYNTHETISCH UND STEHEN ABSICHTLICH NICHT IM BAUM: ein Fall, der auf
   * eine Datei des Moduls zeigte, waere heute leer-gruen. Die Blindstelle ist die
   * WAECHTERSTAERKE ab der naechsten Action, nicht der Bestand.
   */
  const MIT_REGEX = [
    "export async function sonde(x: string) {",
    "  const teile = x.split(/\\//); await requireRadioAdmin();",
    "  return teile;",
    "}",
  ].join("\n");

  it("ein Regexliteral mit zwei Schraegstrichen kappt den Rest der Zeile NICHT", () => {
    /*
     * DER ROTE FALL VON FUND M1, als Test statt als Sonde. `/\//` traegt zwei Schraegstriche
     * nebeneinander; der Schnitt `replace(/\/\/.*$/gm, "")` haelt sie fuer einen
     * Kommentarbeginn und loescht alles dahinter — hier den Riegelaufruf selbst. An einer
     * NEGATIVEN Zusicherung heisst das: weniger Text, weniger gefundene Verstoesse, STILL
     * gruen.
     */
    expect(bereinigt(MIT_REGEX), "das Regexliteral kappt den Riegelaufruf dahinter")
      .toMatch(RIEGEL_ADMIN);
    /*
     * ⛔ UND DIE ZWEITE HAELFTE AUF DER EBENE, AUF DER DIESER SCAN LIEST: der RUMPF, den
     * `exportierteActions` herausschneidet, muss den Riegelaufruf noch fuehren. Ohne diese
     * Zeile bewiese der Fall nur etwas ueber `bereinigt` und nichts ueber den Weg, den die
     * Kernzusicherung tatsaechlich nimmt.
     */
    const sonde = exportierteActions(MIT_REGEX).find((a) => a.name === "sonde");
    expect(sonde?.rumpf ?? "", "der Rumpf verliert den Riegelaufruf hinter dem Regexliteral")
      .toMatch(RIEGEL_ADMIN);
  });

  it("ein echter nachgestellter Kommentar wird weiterhin geschnitten", () => {
    /*
     * DIE GEGENRICHTUNG, und sie gehoert unmittelbar daneben: ohne sie liesse sich der Fall
     * oben erfuellen, indem man den Schnitt ganz entfernt — dann erfuellte ein blosses
     * `// frueher: requireRadioAdmin()` jede positive Zusicherung wieder.
     */
    const mitKommentar = "await schreibe(); // frueher: await requireRadioAdmin()\n";
    expect(bereinigt(mitKommentar), "der nachgestellte Kommentar steht noch da")
      .not.toMatch(RIEGEL_ADMIN);
  });

  it("ein Riegel HINTER einem Kommentar mit Regexliteral zaehlt NICHT als erste Anweisung", () => {
    /*
     * ⛔ DER FALL, DER BEIDE TEILE ZUSAMMEN PRUEFT — und der Grund, warum die Reihenfolge in
     * `bereinigt` lasttragend ist. Die Zeile `const p = /\//; // await requireRadioAdmin();`
     * traegt ein Regexliteral UND einen nachgestellten Kommentar. Schneidet der Kommentar
     * ZUERST, frisst er die zwei Schraegstriche des Literals und laesst den Text dahinter
     * stehen — der Riegelaufruf im Kommentar erfuellte dann die Zusicherung, und die Action
     * liefe ohne jeden Riegel.
     *
     * ⛔ UND WELCHE MUTATION IHN ROT MACHT — GEMESSEN, nicht behauptet (Fix-Runde 1 zu V11,
     * Fund 3; bis dahin stand hier „dieser Fall muss rot sein, wenn die Reparatur fehlt",
     * und das war falsch):
     *
     *   Kommentarschnitt VOR das Leeren der Literale gezogen (M1 neu gebaut) -> HIER GRUEN,
     *       rot wird der Fall „ein Regexliteral … kappt den Rest der Zeile NICHT"
     *   `ohneRegexLiterale` ganz ausgehaengt                                 -> HIER GRUEN,
     *       rot wird derselbe Fall
     *   Kommentarschnitt GANZ entfernt                                       -> HIER ROT,
     *       zusammen mit „ein echter nachgestellter Kommentar wird geschnitten"
     *
     * ⛔ DER GRUND IST RECHNERISCH UND KEIN MANGEL DIESES FALLES: das Literal `/\//` endet auf
     * ZWEI benachbarte Schraegstriche. Ein vorgezogener Kommentarschnitt frisst deshalb die
     * ganze Zeile ab dem Literal — den Riegelaufruf IM Kommentar eingeschlossen —, und der
     * Verstoss wird weiterhin gefunden. M1s Schadensrichtung ist die andere: sie loescht
     * ausfuehrbaren Code HINTER dem Literal, und dagegen steht der Fall darueber.
     *
     * ⛔ WAS DIESER FALL DAFUER ALS EINZIGER HAELT: die ganze Kette (`exportierteActions` →
     * `rumpfGrenzen` → `ersteAnweisung` → `riegelVerstoesse`) ueber einer Zeile, die BEIDE
     * Formen zugleich traegt. Er ist die Bestehensbedingung von Sonde **S-V11e** aus
     * `briefs/V11.md` — dort lautet sie „der Fall MUSS ROT BLEIBEN", nicht „rot werden".
     */
    const SONDE_KOMMENTAR = [
      "export async function sondeKommentar(): Promise<void> {",
      "  const p = /\\//; // await requireRadioAdmin();",
      "  await schreibe(p);",
      "}",
    ].join("\n");
    expect(riegelVerstoesse(SONDE_KOMMENTAR)).toEqual([
      "sondeKommentar: weder requireRadioAdmin( noch requireRadioVerwaltung( (Spec:4382-4386)",
    ]);
  });

  it("die Zeilenzahl bleibt erhalten — sonst luegen alle datei:zeile-Meldungen", () => {
    /*
     * ⛔ DIE ZUSICHERUNG UEBER DEM ECHTEN TEXT IST HEUTE ZAHNLOS, UND DAS STEHT HIER, WEIL ES
     * GEMESSEN IST (Fix-Runde 1 zu V11, Fund 1): `admin/actions.ts` fuehrt kein mehrzeiliges
     * Zeichenketten- oder Template-Literal und keine Zeile, auf der ein `/` als Literalanfang
     * gilt und dort nicht schliesst. Es gibt in `_lib/quelltextScan.ts` genau ZWEI Zeilen, die
     * die Zeilenzahl ueberhaupt verschieben koennen — `_lib/quelltextScan.ts:122`
     * (`ergebnis += "\n"` im Zeichenkettenscanner) und `_lib/quelltextScan.ts:183`
     * (`if (y === "\n") break;` im Regexscanner) —, und
     * BEIDE Mutationen liefen ueber dem echten Text GRUEN, ueber alle Testdateien des Moduls.
     * `ohneKommentare` haelt die Zeilenzahl ohnehin strukturell ueber `split`/`map`/`join`.
     *
     * ⛔ DESHALB EINE SYNTHETISCHE SONDE DANEBEN — dieselbe Form wie Fall 4 und Fall 14, und
     * aus demselben Grund: der Bestand traegt die Fehlerform heute nicht, die Zusage gilt
     * trotzdem. Sie traegt genau die zwei Formen:
     *
     *   1. ein Template-Literal ueber ZWEI Zeilen — `_lib/quelltextScan.ts:122` ist die
     *      einzige Stelle, die dessen Zeilenumbruch beim Leeren rettet;
     *   2. `x! / 2` — ⚠️ KEIN erfundener Sonderfall, sondern gueltiges TypeScript: `!` steht
     *      in `REGEX_ERLAUBT` (`_lib/quelltextScan.ts:162-163`), eine Nicht-Null-Behauptung
     *      vor einer Division gilt dem Scanner also als Literalanfang. Sie schliesst auf
     *      ihrer Zeile nicht; erst die NAECHSTE Zeile traegt wieder ein `/`. Ohne
     *      `_lib/quelltextScan.ts:183` frisst der Scanner alles dazwischen, den
     *      Zeilenumbruch eingeschlossen.
     *
     * ⛔ WARUM DAS ZAEHLT: jede Meldung dieses Scans nennt `datei:zeile`. Verschiebt die
     * Bereinigung die Zeilenzahl, zeigt jede davon auf die falsche Zeile — STILL.
     */
    const roh = quelle();
    expect(
      bereinigt(roh).split("\n").length,
      "admin/actions.ts: die Bereinigung verschiebt die Zeilenzahl",
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

  it("kein Scan dieses Moduls liest die ungeschuetzte Fassung direkt", () => {
    /*
     * ⛔ DER RIEGEL GEGEN DIE RUECKKEHR VON M1 (Vorabscan-Funde F7 und F16). Nach dem Umzug
     * nach `_lib/quelltextScan.ts` zaehlt `riegel.test.ts` die Nadel nur noch in der
     * HILFSDATEI — ein Scan, der die Zwischenstufe nachbaute und direkt riefe, liesse jenen
     * Zaehler bei 2 und den Fall gruen. Dieser Fall schliesst die Luecke und macht ⬜ V-L9
     * sichtbar bewacht.
     *
     * ⛔ GEFUNDEN STATT AUFGEZAEHLT — Fix-Runde 1 zu V11, Fund 2, und der Grund ist GEMESSEN.
     * Die Vorgaengerfassung las eine fest verdrahtete Vierertafel (`riegel.test.ts`,
     * `admin/actions.test.ts`, `_lib/bauform.test.ts`, `_actions/guards.test.ts`) und hatte
     * KEINE Vollzaehligkeitsklausel. Eine FUENFTE Scandatei mit eigener Kopie — genau ⬜ V-L9s
     * Klasse, gegen die dieser Fall gebaut ist — war fuer sie unsichtbar: `_lib/probe5.test.ts`
     * mit eigener Deklaration UND eigenem Aufruf angelegt → `Test Files 55 passed (55)` ·
     * `Tests 755 passed | 5 todo (760)`, kein einziger Fall rot. Gezaehlt wird deshalb ueber
     * `alleModulDateien()`, und die Tafel unten ist die SOLL-Fundmenge, nicht die Leseliste.
     *
     * ⛔ DIE SOLLWERTTAFEL, jede Zahl mit rohem `/usr/bin/grep -c` gemessen:
     *
     *   _actions/guards.test.ts 2 — eigene, bereits reparierte Kopie (`6331e77`, `4ed3410`):
     *   _lib/bauform.test.ts    2   Deklaration und der eine Aufruf in ihrem `bereinigt`
     *   _lib/quelltextScan.ts   2 — das Original: Deklaration und der Aufruf in `bereinigt`
     *
     * ⚠️ `_lib/quelltextScan.ts` STEHT DAMIT DOPPELT BEWACHT: `riegel.test.ts` haelt dieselbe
     * Zahl noch einmal mit `toBe(2)`. Das ist Absicht und hier benannt, damit sich niemand
     * wundert, wenn EIN Umbau ZWEI Dateien rot macht — jener Fall bewacht die Hilfsdatei
     * namentlich, dieser die Vollzaehligkeit ueber dem ganzen Modul.
     *
     * ⛔ `riegel.test.ts` UND DIESE DATEI KOMMEN IN DER TAFEL NICHT VOR, UND DAS IST DIE
     * ZUSICHERUNG, NICHT IHRE AUSLASSUNG: sie beziehen `bereinigt` aus der Hilfsdatei, deren
     * Zwischenstufen nicht exportiert sind. Die zwei Zeilen unter der Tafel halten das fest,
     * ⚠️ ABER SIE TRAGEN UNGLEICH VIEL, und das steht hier, statt eine Symmetrie zu behaupten,
     * die es nicht gibt (Fix-Runde 1 zu V11, dieselbe Pruefung wie Fund 8):
     *
     *   ueber SOLL      ⛔ der eigentliche Riegel. Er sperrt den naheliegenden „Gruen-Fix" —
     *                   die eigene Datei mit ihrer neuen Zahl einfach in die Tafel eintragen.
     *                   Diesen Zustand weist KEINE andere Zeile ab. ⚠️ Er ist ueber einer
     *                   Konstanten formuliert und damit nur durch eine Aenderung AN DIESER
     *                   DATEI ausloesbar; eine Mutationssonde am Pruefling gibt es fuer ihn
     *                   nicht, und es kann keine geben.
     *   ueber `gefunden` ⚠️ vom `toEqual` darueber DOMINIERT: taucht die Nadel in einer der
     *                   zwei Dateien auf, ist jenes bereits rot. Diese Zeile steht fuer ihre
     *                   MELDUNG, nicht fuer eine eigene Fehlerklasse.
     */
    // ⛔ UEBER `ohneKommentare` GELESEN, NICHT UEBER DEN ROHTEXT: eine blosse ERWAEHNUNG des
    // Namens in einem Kommentar der gelesenen Datei waere sonst eine weitere Fundstelle. Die
    // Nadel ist zusammengesetzt, weil das Literal selbst im gescannten Text steht.
    const nadel = "ohneKommentareUnd" + "Zeichenketten(";
    const SOLL: [string, number][] = [
      ["_actions/guards.test.ts", 2],
      ["_lib/bauform.test.ts", 2],
      ["_lib/quelltextScan.ts", 2],
    ];
    const NIE = ["riegel.test.ts", "admin/actions.test.ts"];

    const dateien = alleModulDateien();
    expect(dateien.length, "der Modulbaum wurde nicht gelesen — die Tafel darunter waere blind")
      .toBeGreaterThanOrEqual(MODUL_DATEIEN_MINDESTENS);

    const gefunden = dateien
      .map(
        (pfad) =>
          [
            relative(MODUL, pfad).replace(/\\/g, "/"),
            ohneKommentare(readFileSync(pfad, "utf8")).split(nadel).length - 1,
          ] as [string, number],
      )
      .filter(([, anzahl]) => anzahl > 0)
      .sort((links, rechts) => links[0].localeCompare(rechts[0]));

    expect(gefunden, "ein Scan dieses Moduls liest die ungeschuetzte Fassung direkt")
      .toEqual(SOLL);
    expect(
      SOLL.map(([pfad]) => pfad).filter((pfad) => NIE.includes(pfad)),
      "die Sollwerttafel duldet eine Fundstelle in einem Scan, der die Nadel nie fuehren darf",
    ).toEqual([]);
    expect(
      gefunden.map(([pfad]) => pfad).filter((pfad) => NIE.includes(pfad)),
      "ein Scan, der `bereinigt` importiert, ruft die ungeschuetzte Fassung direkt",
    ).toEqual([]);

    expect(relative(MODUL, SELBST), "der Selbstbezug oben zeigt nicht mehr auf diese Datei")
      .toBe("admin/actions.test.ts");
  });
});
