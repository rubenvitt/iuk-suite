// src/app/m/radio/_actions/guards.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DER EINE `_actions/`-SCAN (Spec 1 §3.8 Zeile 3111, praezisiert in Spec:6762 und B7
 * Spec:96; B14 Spec:103 und B19 Spec:119: ES GIBT NUR DIESEN EINEN).
 *
 * ⛔ `riegel.test.ts` FUEHRT KLAUSEL (b) AUSDRUECKLICH NICHT (`riegel.test.ts:364-376`).
 * Zwei Scans ueber dieselbe Flaeche, von denen einer die Ausnahmen nicht kennt, sind ein
 * Scan zu viel — und der naheliegende Gruen-Fix des unwissenden Scans waere, in
 * `einloesenAmGate` einen Sitzungsriegel einzusetzen. Das macht das GATE UNBENUTZBAR
 * (die Tuer, die sich selbst abschliesst) und sieht wie eine Verbesserung aus
 * (§3.3.3, Spec:2359-2362).
 *
 * ⛔ WAS ER FAENGT: die vergessene Riegelzeile. Sie ist typkorrekt, lint-sauber und fuer
 * `pnpm build` unsichtbar — und bei `requireAusleihSchreibend` ist sogar der AUFRUF ohne
 * Ergebnispruefung typkorrekt (Spec:2780-2784). Deshalb prueft dieser Scan BEIDES: dass
 * ein Riegel gerufen wird, UND dass sein Ergebnis nicht verworfen wird.
 *
 * ⛔ FIX-RUNDE 1 (2026-08-23, REVIEW-A8 W1/W2/W3): drei gemessene Loecher sind zu. Alle
 * drei liessen den Scan GRUEN ueber einer ungeriegelten exportierten Action stehen:
 *   W1 — der `koerper` reichte bis zum NAECHSTEN `export`; eine private Hilfsfunktion
 *        dahinter, die einen Riegel ruft, wurde der Action zugeschlagen. Jetzt endet der
 *        `koerper` an der RUMPFKLAMMER (`rumpfGrenzen`).
 *   W2 — nur die Deklarationsform war sichtbar; `export const x = async () => {}` ist in
 *        einer `"use server"`-Datei eine gueltige Action und war unsichtbar. Jetzt
 *        VERBIETET der vierte Fall jede andere Laufzeit-Exportform, statt sie zu pruefen.
 *   W3 — der Kommentar versprach „der Riegel ist die ERSTE Anweisung", geprueft wurde nur
 *        die Reihenfolge gegen `formData.get`. Jetzt wird die erste Anweisung geprueft.
 */
const ORDNER = join(process.cwd(), "src/app/m/radio/_actions");

/**
 * ⛔ GENAU DREI EINTRAEGE — Planentscheidung E12, und die Abweichung von Spec:6762
 * („GENAU ZWEI") ist dort ausgeschrieben begruendet. Alle drei tragen `requireRadioHost`
 * und ausdruecklich KEINEN Sitzungsriegel:
 *
 *   gate.ts#einloesenAmGate    — sie ERZEUGT die Sitzung. Ein Sitzungsriegel davor waere
 *                                die Tuer, die sich selbst abschliesst (§3.3.3,
 *                                Spec:2359-2362).
 *   sitzung.ts#erneuereSitzung — sie ERZEUGT sie ebenfalls, am Formular, ohne die
 *                                eingetragenen Werte zu verlieren (§3.4.4,
 *                                Spec:2563-2570; dritte der „genau drei Stellen" aus
 *                                Spec:2258). Vorbild woertlich:
 *                                `lagerbuch/_actions/sitzung.ts:17-26` und `:51`.
 *   sitzung.ts#beenden         — sie BEENDET die Sitzung. Ein Riegel, der eine gueltige
 *                                Sitzung verlangt, machte aus einem toten Cookie ein
 *                                unloeschbares (§3.4.5, Spec:2774).
 *
 * ⛔ DIESE LISTE IST EINE BENANNTE KONSTANTE, DAMIT EIN SPAETERER EINTRAG EIN BEWUSSTER
 * AKT BLEIBT (B14, Spec:103). Ihre LAENGE wird unten mitgeprueft. ⛔ EIN VIERTER EINTRAG
 * IST EIN ROTER TEST UND KEINE ZEILE IM DIFF.
 */
const AUSNAHMEN = [
  "gate.ts#einloesenAmGate",
  "sitzung.ts#beenden",
  "sitzung.ts#erneuereSitzung",
] as const;

/** ⛔ HEUTE EINS (`codes.ts`), angehoben von A9 (3: + gate.ts, sitzung.ts) und A17
 *  (4: + ausleihe.ts). EXAKT, nicht „mindestens" — dieselbe Begruendung wie bei
 *  `HANDLER_ANZAHL` in `riegel.test.ts:60-72`: `laenge >= 0` ist fuer jede Liste wahr. */
const ACTION_DATEIEN_ANZAHL = 1;

/**
 * ⛔ DIE ZWEITE EXISTENZPFLICHT, UND SIE IST NEU (REVIEW-A8 W2, zweite Haelfte): die
 * DATEIzahl buergt fuer Dateien, nicht fuer EXPORTE. Faende `exportierteActions` in jeder
 * Datei nichts — weil die Hausform sich aendert, weil das Muster bricht —, bliebe
 * `verstoesse` leer und der Riegelscan LEER-GRUEN, waehrend die Dateizahl weiter stimmt.
 *
 * ⛔ EXAKT, NICHT „MINDESTENS" — dieselbe Begruendung wie oben und wie
 * `riegel.test.ts:60-72`. `riegel.test.ts:697` fuehrt an derselben Stelle eine
 * Untergrenze; die ist fuer jede nichtleere Liste wahr und hat keine Mutation, die sie
 * rot macht. Hier steht deshalb die schaerfere Form.
 *
 * DER ANHEBE-FAHRPLAN, eine Auflage an die Nachfolger — die Zahlen sind aus den Briefen
 * abgelesen, nicht geraten:
 *   A8  `codes.ts`:    erstelleCode, setzeCodeAktiv                        -> 2
 *   A9  + `gate.ts`:   einloesenAmGate (briefs/A910.md:62)
 *       + `sitzung.ts`: beenden, erneuereSitzung (briefs/A910.md:87-88)    -> 5
 *   A17 + `ausleihe.ts`: ausleiheAnlegen, rueckgabeBuchen,
 *       entleiherVorschlaege, listeAktualisieren (briefs/A17.md:26-29)     -> 9
 */
const ACTION_DEKLARATIONEN_ANZAHL = 2;

const RIEGEL = /\brequireRadioAdmin\s*\(|\brequireAusleihSchreibend\s*\(/;
const HOST_RIEGEL = /\brequireRadioHost\s*\(/;

/**
 * ⛔ DIE EINZIGE ZULAESSIGE FORM EINES LAUFZEIT-EXPORTS UNTER `_actions/` (REVIEW-A8 W2).
 *
 * Erlaubt sind daneben NUR `export type` und `export interface` — beide werden vom
 * Uebersetzer GELOESCHT und koennen deshalb gar keine Action sein. Das ist der Grund,
 * nicht der Hausstil: `_actions/ausleihe.ts` aus A17 fuehrt `export type { AusleihErgebnis,
 * RueckgabeErgebnis };` (briefs/A17.md:24) und `_actions/gate.ts` aus A9 fuehrt
 * `export type GateZustand = { fehler?: string };` (briefs/A910.md:60) — ein pauschales
 * Verbot machte beide Aufgaben rot-by-construction, und der naheliegende Fix waere, diesen
 * Scan abzuschwaechen.
 *
 * ⛔ WARUM VERBIETEN STATT PRUEFEN: `export const x = async () => {}` ist in einer
 * `"use server"`-Datei eine vollwertige Server Action. Gemessen am 2026-08-23: ungeriegelt
 * angehaengt lief der Scan `Tests 4 passed` gruen — sie war fuer ihn unsichtbar. Die Deckung
 * des Scans um jede weitere Form zu erweitern, hiesse jede kuenftige Form mitzuraten; sie zu
 * VERBIETEN macht die Luecke konstruktiv unmoeglich.
 * ⚠️ GEMESSEN, dass das keine Erfindung ist: ein `grep -rn "^export const .* = async"`
 * ueber saemtliche `_actions`-Verzeichnisse der Suite liefert NULL Treffer — die Hausform
 * ist heute ausnahmslos die Deklaration. ⛔ Aber eine Gewohnheit ist kein Riegel, und vor
 * dieser Zeile gab es keinen.
 *
 * ⚠️ MITVERBOTEN, UND DAS IST ABSICHT: `export default`, `export { x }`, `export * from`
 * und die generische Form `export async function f<T>(…)`. Die letzte ist heute ebenfalls
 * unsichtbar (das Muster unten verlangt `(` direkt hinter dem Namen); eine generische
 * Server Action ist ohnehin keine sinnvolle Form, weil jedes Argument serialisierbar sein
 * muss.
 */
const EXPORT_FORM = /^export\s+(?:type\b|interface\b|(?:async\s+)?function\s+\w+\s*\()/;

function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  /*
   * ⛔ DER ENDUNGSFILTER IST ES, DER „DIE DATEI UEBERSPRINGT SICH SELBST" ERFUELLT
   * (Auflage des A8-Briefs). Bis zur Fix-Runde 1 stand darunter zusaetzlich ein
   * `.filter((p) => p !== SELBST)` — ein TOTER PFAD (REVIEW-A8 S1): `guards.test.ts` ist
   * bereits durch `!/\.(?:test|spec)\.ts$/` verworfen, gemessen am 2026-08-23. Ein toter
   * Filter liest sich wie ein zweiter Riegel und ist keiner; er ist deshalb raus, und der
   * verbliebene traegt die Auflage hier namentlich.
   */
  return readdirSync(ORDNER)
    .filter((d) => /\.ts$/.test(d) && !/\.(?:test|spec)\.ts$/.test(d))
    .map((d) => join(ORDNER, d));
}

/*
 * ⛔ HIER STEHEN DIE ZWEI ECHTEN FUNKTIONEN, KOPIERT AUS `riegel.test.ts:148-213`
 * (`ohneKommentare` und `ohneKommentareUndZeichenketten`, mit ihren Kommentaren).
 *
 * ⚠️ „KOPIERT", NICHT „WOERTLICH" — UND DIE ABWEICHUNG STEHT HIER STATT IN EINER
 * BEHAUPTUNG (REVIEW-A8 S5). Bis zum 2026-08-23 stand an dieser Stelle „WOERTLICH KOPIERT
 * … mit ihren Kommentaren"; gemessen wurde die Kopie gegen `riegel.test.ts:148-213`, und
 * AUSGELASSEN sind `riegel.test.ts:152-156` — ein riegel-spezifischer Absatz ueber den
 * Kopfkommentar von `_lib/zugang.ts`. Er redet ueber `_lib/`, nicht ueber `_actions/`; die
 * Auslassung ist richtig, die Behauptung „woertlich" war es nicht. DIE RUMPFE SIND
 * ZEICHENGLEICH — das war die einzige Abweichung. Die Kopie steht unmittelbar unter diesem
 * Absatz (`ohneKommentare` und `ohneKommentareUndZeichenketten`).
 *
 * ⛔ KEIN `declare function`. Eine reine Typdeklaration hat keinen Rumpf: `typecheck`
 * bliebe GRUEN und der Test stuerbe zur Laufzeit an „is not a function" — die
 * verwirrendste aller Kombinationen, weil das erste Tor sie durchwinkt.
 *
 * ⛔ KEIN IMPORT AUS `riegel.test.ts` — vitest laedt Testdateien nicht als Module
 * fuereinander, und eine geteilte Helferdatei waere ein `_lib/`-Modul, das der
 * `"use client"`-Scan mitzaehlt (`riegel.test.ts:684-703` filtert auf `/(?:_lib|_db)/`).
 * Die Verdoppelung ist der Preis dafuer und gewollt; der Bericht zu A8 fuehrt die
 * verworfene Alternative samt Belegen.
 *
 * Ohne das Leeren der Literale erfuellte ein String `"requireRadioAdmin("` als reiner
 * Text die Behauptung, OHNE dass der Riegel je liefe.
 */
/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
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
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale UND nachgestellte Kommentare
 * geleert. Nur fuer die POSITIVEN Nachweise noetig: `toMatch` behauptet, dass ein Muster
 * VORKOMMT — ein String `"requireRadioAdmin("` oder ein `// frueher: requireRadioHost(kopf)`
 * erfuellte das sonst, OHNE dass der Riegel je liefe (gemessen, Fund N1 aus
 * `.superpowers/sdd/planteil3/REVIEW-A2.md` uebertragen; `bauform.test.ts:164-176`).
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
  return ergebnis.replace(/\/\/.*$/gm, ""); // ⛔ ZULETZT: davor zerrisse er "https://…"
}

/**
 * ⛔ REGEXLITERALE WERDEN GELEERT, UND ZWAR VOR JEDER KLAMMERZAEHLUNG. Gemessen am
 * 2026-08-23, Fix-Runde 1: `ohneKommentareUndZeichenketten` leert Kommentare und
 * Zeichenketten, aber KEIN Regexliteral. Eine unbalancierte Klammer darin — `/^[A-Z(]+$/`,
 * `/[}]/`, `/[{]/` — verschiebt jeden Zaehler dahinter, und die Wirkung war STILL: die
 * Sonde `sondeRegexZuSpaet` (Riegel hinter einem `db`-Zugriff, davor genau so ein
 * Literal) lief mit LEERER Verstossliste durch. Ein Regexliteral steht in einer Action
 * nicht theoretisch — `normalisiereCode` (A9) ist genau die Form, die jemand in die
 * ersten Zeilen eines Rumpfes schreibt.
 *
 * Ein `/` beginnt ein Literal, wenn das letzte bedeutsame Zeichen davor keinen WERT
 * abschliesst (dann waere es eine Division). Die Liste unten ist die uebliche und
 * bewusst grosszuegig: wird ein Divisionszeichen faelschlich fuer einen Literalanfang
 * gehalten, verschwindet Quelltext aus der Sicht des Scans, und die naechste Behauptung
 * darueber schlaegt LAUT fehl — nie still.
 */
const REGEX_ERLAUBT =
  /(?:^|[([{,;:=!&|?+\-*%~^<>]|\breturn|\btypeof|\binstanceof|\bin|\bof|\bnew|\bdelete|\bvoid|\bcase|\bdo|\belse|\byield|\bawait)$/;

function ohneRegexLiterale(q: string): string {
  let ergebnis = "";
  let i = 0;
  while (i < q.length) {
    const z = q[i]!;
    if (z === "/" && REGEX_ERLAUBT.test(ergebnis.trimEnd())) {
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
 * Die eine Bereinigung, die JEDER Scan dieser Datei benutzt: Kommentare, Zeichenketten
 * UND Regexliterale geleert, Zeilenzahl erhalten.
 */
function bereinigt(quelle: string): string {
  return ohneRegexLiterale(ohneKommentareUndZeichenketten(quelle));
}

/**
 * DIE GRENZEN DES FUNKTIONSRUMPFES: Index der oeffnenden `{` und Index der zugehoerigen
 * schliessenden `}` — gezaehlt, nicht geraten.
 *
 * ⛔ DAS IST DIE BEHEBUNG VON REVIEW-A8 W1, UND DER FUND WAR GEMESSEN: bis zum 2026-08-23
 * endete der `koerper` einer Deklaration am NAECHSTEN `export`. Eine NICHT exportierte
 * Hilfsfunktion HINTER einer ungeriegelten Action wurde damit deren `koerper`
 * zugeschlagen, und ihr Riegel erfuellte die Behauptung fuer die Action. Belegt:
 * `export async function sondeOhneRiegel()` allein faerbte den Scan rot; dieselbe Sonde
 * plus ein `async function hilfsRiegel(){ await requireRadioAdmin(); }` dahinter lief mit
 * `Tests 4 passed (4)` GRUEN durch.
 *
 * `abParamAuf` steht HINTER der oeffnenden `(` der Parameterliste.
 *
 * Drei Abschnitte, in dieser Reihenfolge:
 *   1. die Parameterliste ueberspringen (Klammerzaehlung auf `(`/`)`),
 *   2. die Rueckgabe-Annotation ueberspringen — sie darf `{` enthalten, aber nur INNERHALB
 *      von `<…>`, `(…)` oder `[…]`; `Promise<{ code: string }>` ist genau dieser Fall,
 *   3. ab der Rumpfklammer bis zu ihrer Partnerin zaehlen.
 *
 * ⚠️ DIE EINE FORM, DIE DIESE ZERLEGUNG NICHT TRIFFT, IST BENANNT: eine Rueckgabe-
 * Annotation, die auf oberster Ebene ein Objektliteral fuehrt (`): { a: number } {`).
 * Der Scan hielte sie fuer den Rumpf und meldete anschliessend „der Riegel ist nicht die
 * erste Anweisung" — er ist dort also FALSCH-POSITIV UND LAUT, nie falsch-negativ und
 * still. Das ist die Richtung, die dieses Haus verlangt (`riegel.test.ts:157-161`).
 *
 * ⛔ KEIN STILLER RUECKFALL: laesst sich der Rumpf nicht bestimmen, ist das ein VERSTOSS
 * und kein „dann eben bis zum naechsten export". Genau dieser Rueckfall WAR W1.
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
      // Eine `;` auf oberster Ebene vor jeder `{` heisst: die Deklaration hat keinen
      // Rumpf (Ueberladungssignatur). Das ist unter `_actions/` keine gueltige Form.
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
 * ⛔ DAS IST DIE BEHEBUNG VON REVIEW-A8 W3. Der Kommentar an dieser Stelle behauptete
 * „DER RIEGEL IST DIE ERSTE ANWEISUNG (Spec:2770)", geprueft wurde aber nur die
 * Reihenfolge gegen `formData.get`. Gemessen am 2026-08-23: eine Action, die erst
 * SCHREIBT und danach riegelt, lief mit `Tests 4 passed (4)` gruen durch.
 * Spec:2770 („Rueckgabewert, erste Anweisung") und Spec:3405-3406
 * („als erste Anweisung, vor jedem Lesen von `formData`") tragen die schaerfere Zusage —
 * jetzt loest der Code sie ein, statt sie zu behaupten.
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
       * ⛔ EINE `{` AUF OBERSTER EBENE IST ZWEIERLEI, UND DIE VERWECHSLUNG WAERE STILL:
       * bei `const { ok } = await requireAusleihSchreibend(…)` gehoert sie zur BINDUNG und
       * die Anweisung laeuft weiter; bei `if (…) {` beginnt sie einen BLOCK, und dann ist
       * die erste Anweisung eben dieser Block und nicht das, was in ihm steht. Wer beides
       * gleich behandelt, laesst einen Riegel IM zweiten Block als „erste Anweisung"
       * durchgehen — falsch-negativ und still, genau die Richtung, die hier verboten ist.
       *
       * ⚠️ DIE LISTE `=`/`const`/`let`/`var` IST BEWUSST KURZ, UND IHRE LUECKEN GEHEN ALLE
       * IN DIE STRENGE RICHTUNG. Steht vor der Klammer etwas anderes — `return {`, `? {`,
       * `, {` —, schneidet dieser Zweig FRUEHER ab als noetig. Die erste Anweisung wird
       * dadurch kuerzer, nie laenger; der Scan meldet also hoechstens einen Riegel als
       * „nicht erste Anweisung", der es doch war. LAUT, nicht still — und in jedem dieser
       * Faelle ist die erste Anweisung ohnehin kein Riegelaufruf.
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
  /*
   * ⛔ KEIN ABSCHLUSS AUF OBERSTER EBENE GEFUNDEN — UND HIER WIRD DER SCAN LAUT STATT
   * NACHSICHTIG. Bis zur Fix-Runde 1 gab diese Stelle den GANZEN Rumpf zurueck; ein
   * beliebig weit hinten stehender Riegel galt damit als „erste Anweisung", und jede
   * Entgleisung der Zaehler wurde zu einem STILLEN Freispruch (gemessen mit einem
   * Regexliteral im Rumpf, siehe `ohneRegexLiterale`). `null` heisst: der Aufrufer meldet
   * einen Verstoss. Ein Rumpf, dessen erste Anweisung sich nicht bestimmen laesst, ist
   * eine Form, ueber die dieser Scan nichts zusichern kann — und das gehoert gesagt.
   */
  return null;
}

/**
 * Die exportierten FUNKTIONEN einer Datei, je mit ihrem Koerperausschnitt und ihrem Rumpf.
 *
 * ⛔ `export type` UND `export interface` WERDEN VERWORFEN (Spec:6762). Ohne das waere
 * der Scan auf `AusleihErgebnis` und `RueckgabeErgebnis` rot-by-construction — und der
 * naheliegende Fix waere, den Scan abzuschwaechen.
 *
 * ⛔ GEZAEHLT WIRD JE DATEI JE DEKLARATION, NIE UEBER EIN `Set` DER NAMEN (Spec:6762):
 * zwei gleichnamige Exporte in zwei Dateien fielen sonst zu einem zusammen, und einer
 * bliebe unbewacht.
 *
 * ⛔ `koerper` ENDET AN DER RUMPFKLAMMER, NICHT AM NAECHSTEN `export` (W1, oben). Ist der
 * Rumpf nicht bestimmbar, traegt der Eintrag `rumpf: null` — der Aufrufer meldet das als
 * Verstoss.
 */
function exportierteActions(
  quelle: string,
): { name: string; koerper: string; rumpf: string | null }[] {
  const q = bereinigt(quelle);
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
 * Die LOKALEN Namen einer Bindung — `zugang` bei `const zugang = …`, `ok`/`viewer` bei
 * `const { ok, zugang: viewer } = …`.
 *
 * ⚠️ ABSICHTLICH GROBKOERNIG: Vorgabewerte und Rest-Elemente werden nicht ausgewertet.
 * Der Scan verlangt unten, dass MINDESTENS EINER dieser Namen wieder vorkommt — eine
 * grobere Zerlegung macht ihn also nachsichtiger, nie strenger, und kann keinen
 * Fehlalarm erzeugen.
 */
function gebundeneNamen(muster: string): string[] {
  if (!muster.startsWith("{")) return [muster];
  return muster
    .slice(1, -1)
    .split(",")
    .map((teil) => {
      const seiten = teil.split(":");
      const rechts = seiten[seiten.length - 1]!;
      return /(\w+)/.exec(rechts)?.[1] ?? "";
    })
    .filter((n) => n.length > 0);
}

describe("radio-_actions: jede exportierte Action traegt ihren Riegel", () => {
  it("die Dateizahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⛔ DIE EXISTENZPFLICHT. Ohne sie liefe dieser Block ueber einer leeren Liste gruen
     * und bewachte nichts — dieselbe Fehlerklasse wie NT11 („ein Waechter, der `>= 5`
     * statt `= 6` prueft, bleibt gruen und bewacht nichts").
     *
     * DER ANHEBE-FAHRPLAN, eine Auflage an die Nachfolger:
     *   A8  legt `codes.ts` an                       -> 1
     *   A9  legt `gate.ts` und `sitzung.ts` an       -> 3
     *   A17 legt `ausleihe.ts` an                    -> 4
     */
    expect(actionDateien().length, "ACTION_DATEIEN_ANZAHL anheben — Fahrplan im Kopf dieser Datei")
      .toBe(ACTION_DATEIEN_ANZAHL);
  });

  it("die Ausnahmeliste hat GENAU DREI Eintraege", () => {
    /*
     * ⛔ Spec:6762: „Der Scan zaehlt die Ausnahmen MIT: waechst die Liste, ist das ein
     * ROTER TEST und keine Zeile im Diff." Eine WEITERE Ausnahme ist der Weg, auf dem
     * dieser Scan aufhoert, etwas zu bedeuten — und sie sieht in einem Diff aus wie eine
     * Zeile Wartung.
     *
     * ⚠️ SPEC:6762 SCHREIBT „GENAU ZWEI". Diese Zahl ist unter der Annahme geschrieben,
     * dass es `erneuereSitzung` nicht gibt; Spec:2258 („genau DREI Stellen, die eine
     * Ausleih-Sitzung ausstellen"), Spec:3108, Spec:2563-2570 und Zusage §3.10 Nr. 8
     * verlangen sie. Die Aufloesung ist Planentscheidung E12, dort ausgeschrieben.
     * ⛔ WER SIE ZURUECKDREHT, MUSS `erneuereSitzung` MIT ZURUECKDREHEN — die beiden
     * haengen aneinander.
     */
    expect(AUSNAHMEN.length, "eine vierte Ausnahme ist eine ENTSCHEIDUNG, kein Diff").toBe(3);
    expect([...AUSNAHMEN].sort()).toEqual([
      "gate.ts#einloesenAmGate",
      "sitzung.ts#beenden",
      "sitzung.ts#erneuereSitzung",
    ]);
  });

  it("jeder Laufzeit-Export unter _actions ist eine export-function-Deklaration", () => {
    /*
     * ⛔ DER VIERTE FALL, NEU IN DER FIX-RUNDE 1 (REVIEW-A8 W2). Er PRUEFT die Pfeilform
     * nicht, er VERBIETET sie — Begruendung an `EXPORT_FORM` im Kopf dieser Datei.
     *
     * ⚠️ WARUM DAS NICHT LEER-GRUEN LAUFEN KANN, obwohl hier keine eigene Untergrenze
     * steht: die Dateiliste ist im ersten Fall EXAKT gezaehlt, und die Zahl der
     * Deklarationen im dritten. Faende dieser Block nichts, waere spaetestens einer der
     * beiden rot. Eine dritte Untergrenze hier waere ein zweiter Waechter ueber derselben
     * Flaeche — die Form, gegen die B14 steht.
     */
    const verstoesse: string[] = [];
    for (const pfad of actionDateien()) {
      const q = bereinigt(readFileSync(pfad, "utf8"));
      for (const treffer of q.matchAll(/\bexport\b/g)) {
        const ausschnitt = q.slice(treffer.index!, treffer.index! + 160).replace(/\s+/g, " ");
        if (!EXPORT_FORM.test(ausschnitt)) {
          verstoesse.push(
            `${relative(ORDNER, pfad)}: ${ausschnitt.slice(0, 60).trim()} — nur ` +
              "`export [async] function Name(`, `export type` und `export interface` sind " +
              "hier zulaessig (REVIEW-A8 W2)",
          );
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel", () => {
    const verstoesse: string[] = [];
    let deklarationen = 0;
    for (const pfad of actionDateien()) {
      const datei = relative(ORDNER, pfad);
      const quelle = readFileSync(pfad, "utf8");
      for (const { name, koerper, rumpf } of exportierteActions(quelle)) {
        deklarationen++;
        const schluessel = `${datei}#${name}`;
        if (rumpf === null) {
          /*
           * ⛔ KEIN STILLER RUECKFALL AUF „BIS ZUM NAECHSTEN export" — genau der war W1.
           * Ein unbestimmbarer Rumpf ist ein Verstoss, damit er repariert wird und nicht
           * durchrutscht.
           */
          verstoesse.push(`${schluessel}: Rumpf nicht bestimmbar — der Scan kann hier nichts zusichern`);
          continue;
        }
        const erste = ersteAnweisung(rumpf);
        if (erste === null) {
          verstoesse.push(
            `${schluessel}: erste Anweisung nicht bestimmbar — der Scan kann hier nichts zusichern`,
          );
          continue;
        }
        if ((AUSNAHMEN as readonly string[]).includes(schluessel)) {
          /*
           * ⛔ EINE AUSNAHME IST KEINE FREISTELLUNG. Alle drei Ausnahmen tragen
           * `requireRadioHost` ALS ERSTE ANWEISUNG (Spec:6762, §3.5.5 Spec:2774) —
           * die eine Ausnahme vom Grundsatz „Actions werfen nicht", weil ein Action-POST
           * auf falschem Host kein Betriebsfall ist, sondern ein manipulierter
           * (Spec:2360-2362).
           *
           * ⛔ „ERSTE ANWEISUNG" WIRD SEIT DER FIX-RUNDE 1 AUCH HIER GEPRUEFT und nicht
           * nur behauptet (REVIEW-A8 W3 galt dem Nachbarblock; derselbe Satz stand hier
           * ungedeckt). Die Briefe der Nachfolger tragen ihn woertlich:
           * `briefs/A910.md:73` („Erste Anweisung: `requireRadioHost(await headers())`")
           * und `briefs/A910.md:102` („werfend, erste Anweisung").
           */
          if (!HOST_RIEGEL.test(erste)) {
            verstoesse.push(
              `${schluessel}: Ausnahme OHNE requireRadioHost( als erste Anweisung (Spec:6762)`,
            );
          }
          continue;
        }
        if (!RIEGEL.test(koerper)) {
          verstoesse.push(`${schluessel}: weder requireRadioAdmin( noch requireAusleihSchreibend(`);
        } else if (!RIEGEL.test(erste)) {
          /*
           * ⛔ DER RIEGEL IST DIE ERSTE ANWEISUNG (REVIEW-A8 W3): Spec:2770
           * („Rueckgabewert, erste Anweisung") und §4.2.1 Spec:3405-3406 („als erste
           * Anweisung, vor jedem Lesen von `formData`"). Die Zusage stand bis zum
           * 2026-08-23 nur im Kommentar; eine Action, die erst SCHREIBT und danach
           * riegelt, lief gruen durch. `briefs/A17.md:49` bindet alle vier Ausleih-Actions
           * daran.
           */
          verstoesse.push(
            `${schluessel}: der Riegel ist nicht die ERSTE Anweisung (Spec:2770, §4.2.1)`,
          );
        }
        /*
         * ⛔ DIE ZWEITE HAELFTE, UND SIE IST DIE GEFAEHRLICHERE (Spec:2780-2784):
         * `await requireAusleihSchreibend(db)` OHNE Pruefung des Ergebnisses ist
         * typkorrekt, lint-sauber und OEFFNET DIE ACTION FUER JEDEN. Ein Scan, der nur
         * fragt „steht der Aufruf da?", bestuende genau diesen Fall.
         *
         * Der Nachweis, den ein Quelltext-Scan hier fuehren kann, ist bewusst schwach und
         * benannt: das Ergebnis muss an einen NAMEN gebunden werden
         * (`const x = await requireAusleihSchreibend(...)`), und dieser Name muss danach
         * mindestens einmal vorkommen. Ein Aufruf im Ausdrucks-Kontext ohne Bindung faellt
         * damit auf, und eine Bindung, die nie wieder gelesen wird, ebenfalls.
         * ⚠️ Was er NICHT faengt: eine Bindung, die danach nur geloggt wird.
         * Diese Restluecke traegt der e2e-Test „gesperrter Code wird an der Ausleihe
         * abgewiesen" (Planteil 5).
         *
         * ⚠️ BEIDE HAELFTEN WERDEN GEPRUEFT, NICHT NUR DIE ERSTE (Vorabscan-Fund F6): der
         * Kommentar versprach in der Planfassung mehr, als der Code hielt — die
         * Rueckreferenz auf den gebundenen Namen wurde dort nie benutzt. Sonst bestuende
         * das Netz an dieser Stelle nur aus `no-unused-vars`, und das ist eine Lint-Regel,
         * keine Zusage dieses Moduls.
         *
         * ⛔ DER ERSTE KONJUNKT `RIEGEL.test(koerper)` IST HIER RAUS (Vorabscan-Fund F7):
         * `RIEGEL` ENTHAELT `requireAusleihSchreibend\s*\(` — er war vom zweiten
         * impliziert und laese sich spaeter wie eine Absicht.
         *
         * ⛔ SEIT DER FIX-RUNDE 1 UEBER DEM RUMPF, NICHT UEBER DEM `koerper` (W1): der
         * `koerper` reicht nicht mehr in die naechste Deklaration hinein, aber er fuehrt
         * weiterhin die Signatur, und die Nachverwendung eines Namens ist eine Frage an
         * den Rumpf.
         */
        const bindung =
          /\b(?:const|let)\s+(\w+|\{[^}]*\})\s*=\s*await\s+requireAusleihSchreibend\s*\(/
            .exec(rumpf);
        if (/requireAusleihSchreibend\s*\(/.test(rumpf) && !bindung) {
          verstoesse.push(
            `${schluessel}: requireAusleihSchreibend( ohne Bindung — das Ergebnis wird verworfen (Spec:2780-2784)`,
          );
        }
        if (bindung) {
          const rest = rumpf.slice(bindung.index + bindung[0].length);
          const namen = gebundeneNamen(bindung[1]!);
          const gelesen = namen.some((n) => new RegExp(`\\b${n}\\b`).test(rest));
          if (!gelesen) {
            verstoesse.push(
              `${schluessel}: das Ergebnis von requireAusleihSchreibend( wird gebunden und nie gelesen (Spec:2780-2784)`,
            );
          }
        }
        /*
         * DIE REIHENFOLGE GEGEN `formData.get` — die SPEZIFISCHERE Meldung fuer den Fall,
         * den §4.2.1 (Spec:3405-3406) namentlich fuehrt. Sie steht NEBEN der
         * Erste-Anweisung-Pruefung, nicht statt ihrer: wer `formular.get` vor den Riegel
         * zieht, bekommt beide Zeilen und weiss damit sofort, WELCHE Zusage er gebrochen
         * hat. Ein Scan darf zweimal laut sein; still darf er nicht sein.
         *
         * ⛔ GEMESSEN WIRD IM RUMPF, NICHT IM `koerper`. Der `koerper` fuehrt die
         * PARAMETERLISTE; die bindenden Signaturen aus A17 tragen dort `formular: FormData`
         * (`briefs/A17.md:26-27`) — ein Vergleich ueber den ganzen `koerper` meldete fuer
         * `ausleiheAnlegen` und `rueckgabeBuchen` IMMER „liest formData VOR dem Riegel",
         * bei richtiger Implementierung.
         *
         * ⛔ ZUSAETZLICH VERENGT AUF LESEZUGRIFFE: nicht der NAME `formular` zaehlt,
         * sondern sein `.get(`. Beides zusammen, damit weder eine Annotation noch eine
         * Weitergabe als Argument faelschlich als „Lesen" gilt.
         *
         * ⚠️ REVIEW-A8 S2 IST DAMIT ERLEDIGT: bis zum 2026-08-23 stand hier
         * `koerper.slice(koerper.indexOf("{"))`, was bei `erstelleCode` die Klammer des
         * RUECKGABETYPS `Promise<{ code: string }>` traf statt der Rumpfklammer. Der Rumpf
         * wird jetzt gezaehlt (`rumpfGrenzen`), nicht gesucht.
         */
        const riegelPos = rumpf.search(RIEGEL);
        const formPos = rumpf.search(/\bform(?:Data|ular)\s*\.\s*get\b/);
        if (riegelPos !== -1 && formPos !== -1 && formPos < riegelPos) {
          verstoesse.push(`${schluessel}: liest formData VOR dem Riegel (§4.2.1)`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
    /*
     * ⛔ DIE ZWEITE EXISTENZPFLICHT, NACH der Auswertung (REVIEW-A8 W2, zweite Haelfte).
     * Ohne sie bliebe `verstoesse` leer, wenn `exportierteActions` fuer JEDE Datei nichts
     * liefert — der Scan liefe leer-gruen, waehrend die Dateizahl weiter stimmt.
     * Begruendung der EXAKTEN Zahl und der Anhebe-Fahrplan: `ACTION_DEKLARATIONEN_ANZAHL`
     * im Kopf dieser Datei.
     */
    expect(deklarationen, "ACTION_DEKLARATIONEN_ANZAHL anheben — Fahrplan im Kopf dieser Datei")
      .toBe(ACTION_DEKLARATIONEN_ANZAHL);
  });

  it("jede Datei unter _actions traegt use server als erste Direktive", () => {
    /*
     * Ohne die Direktive ist eine „Server Action" eine gewoehnliche Funktion — der Import
     * aus einer Client-Insel schluege dann fehl oder, schlimmer, zoege den Servercode ins
     * Bundle. `pnpm build` meldet das nicht in jeder Form.
     *
     * ⛔ GEPRUEFT WIRD DIE ERSTE ZEILE, UND DAS IST ABSICHT. Ein Pfadkommentar davor
     * faerbt diesen Scan rot — und der naheliegende „Fix", ihn auf fuehrende Kommentare
     * aufzuweichen, ist der falsche. GEMESSEN am 2026-08-23: alle 18 Nicht-Test-Dateien unter
     * `src/app/m/lagerbuch/_actions/` tragen `"use server";` in ZEILE 1, ausnahmslos.
     * (Der A8-Brief nennt 20 — nachgezaehlt sind es 18; die Aussage traegt unveraendert.)
     * ⚠️ Fuer TESTdateien lautet die Hausform umgekehrt (`riegel.test.ts:1` ist ein
     * Pfadkommentar) — daher die Verwechslung, gegen die dieser Satz steht.
     */
    for (const pfad of actionDateien()) {
      const erste = readFileSync(pfad, "utf8").trimStart().split("\n")[0]!.trim();
      expect(erste, `${relative(ORDNER, pfad)}: keine "use server"-Direktive`)
        .toMatch(/^["']use server["'];?$/);
    }
  });
});
