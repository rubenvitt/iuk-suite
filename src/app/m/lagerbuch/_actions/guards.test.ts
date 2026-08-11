import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * „JEDE EXPORTIERTE ACTION IST BEWACHT" — in der EIGENSCHAFTSFORM.
 *
 * WARUM ES DIESE DATEI GIBT (§3.8.2, Teil 1 Festlegung F4). Der Edge-Cordon
 * deckte bisher auch die Server-Action-POSTs unter /verwaltung ab (Matcher
 * `lagerbuch/src/middleware.ts:35`); mit `middleware.ts` faellt er weg. ER WAR
 * ABER NIE DER EIGENTLICHE RIEGEL: Action-IDs sind GLOBAL, eine
 * Verwaltungs-Action laesst sich jederzeit gegen `/` posten, wo der Matcher nie
 * griff. Die tragende Zusage war und ist die VOLLSTAENDIGKEIT DIESER LISTE.
 *
 * KEIN GATE FINDET DAS: eine fehlende Guard-Zeile ist typkorrekt, lint-sauber
 * und sieht wie ein Erfolg aus, und es gibt keinen Test, der eine Action ohne
 * Sitzung aufruft.
 *
 * ⚠️ ERST DIE EIGENSCHAFT, DANN DIE ZAEHLUNG. Der erste describe-Block toleriert
 * ein fehlendes oder leeres `_actions/` und war damit am ersten Tag gruen. Ein
 * Scan, der `toHaveLength(44)` von Anfang an behauptet, waere am ersten Tag rot
 * gewesen und abgeschaltet statt repariert worden.
 *
 *   Teil 2: die Eigenschaft — describe „_actions/ — jede exportierte Action ist
 *           bewacht". Sie prueft jede Datei, DIE DA IST.
 *   Teil 4 und Teil 5: fuellen den Ordner und fassen DIESE DATEI NICHT AN.
 *   Teil 6 (T172): die ZAEHLUNG — describe „Zaehlung (§2.1 a)" am Dateiende.
 *           47 Deklarationen = 44 bewachte + 3 Ausnahmen, in 18 Action-Dateien.
 *           AB HIER IST EIN LEERES `_actions/` ROT, und das ist der Zweck: eine
 *           Action, die es gar nicht erst in den Ordner geschafft hat, ist fuer
 *           die Eigenschaft unsichtbar. Erst die Zahl macht das Fehlen sichtbar.
 *
 * ⚠️ „19" IST NICHT DIE VERZEICHNISLAENGE (Ruling A7). `readdirSync(ORDNER)`
 * liefert heute 37 Eintraege (18 Action-Dateien + 19 Testdateien) und nie 19.
 * Gemeint ist „18 Action-Dateien PLUS `guards.test.ts`" — genau so ist die
 * Zusicherung unten formuliert. Eine Bindung an die Zahl der TESTdateien waere
 * bei jeder neu angelegten Testdatei rot und ist ausdruecklich nicht gewollt.
 */

const ORDNER = join(process.cwd(), "src/app/m/lagerbuch/_actions");

/** Die einzigen zwei Riegel, die eine Action tragen darf. */
const RIEGEL = /require(?:LagerbuchAdmin|HelferSchreibend)\s*\(/;

/**
 * DIE AUSNAHMELISTE — GENAU DREI EINTRAEGE, jeder einzeln begruendet (§3.8.2).
 *
 * `einloesenAmGate`  (_actions/gate.ts)    — sie ERZEUGT die Sitzung; ein Riegel
 *                    davor waere zirkulaer. Sie traegt stattdessen
 *                    `requireLagerbuchHost` und die Gate-Schranke.
 * `erneuereSitzung`  (_actions/sitzung.ts) — dieselbe Flaeche wie das Gate, nur
 *                    inline im Check (§7.4.4); dieselben drei Riegel.
 * `beenden`          (_actions/sitzung.ts) — loescht ausschliesslich das eigene
 *                    Cookie; ein Riegel davor machte das Abmelden einer
 *                    ABGELAUFENEN Sitzung unmoeglich.
 *
 * Waechst diese Liste, ist das ein ROTER TEST und keine Zeile im Diff.
 */
const AUSNAHMEN = new Set(["einloesenAmGate", "erneuereSitzung", "beenden"]);

/** Diese Datei ueberspringt sich selbst — sonst zaehlte sie sich mit. */
const SELBST = "guards.test.ts";

/**
 * ⚠️ `*.spec.ts(x)` WIRD MITGEFILTERT (Ruling A11, Betreiberentscheidung).
 * Bis T172 stand hier `!n.endsWith(".test.ts")` — eine `foo.spec.ts` unter
 * `_actions/` waere damit als ACTION-MODUL durchgelaufen und der Guard-Scan
 * haette ihre Testhilfen als ungeschuetzte Actions gemeldet. Heute traegt keine
 * Datei im Modul diese Endung, aber die `e2e/`-Konvention der Suite kennt sie.
 * Dieselbe Fassung steht in `_lib/bauform.test.ts:74` und ist dort einzeln
 * begruendet.
 */
function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  return readdirSync(ORDNER)
    .filter((n) => n.endsWith(".ts") && n !== SELBST && !/\.(?:test|spec)\.tsx?$/.test(n))
    .sort();
}

/**
 * Der Rumpf einer Deklaration, beginnend NACH der Signaturzeile.
 *
 * Die Datei setzt FORMATIERTEN Quelltext voraus — kein Auto-Formatierer
 * erzwingt das in diesem Repo (kein `biome.json`, keine Prettier-Konfiguration;
 * `package.json` kennt nur `"lint": "eslint"`), die Erkennung ruht also auf den
 * Konventionen des Bestands: formatierter Code beendet die Signatur mit `{` am
 * Zeilenende. Das ist billiger als ein TypeScript-Parser im Test: der muesste
 * `tsc` mitziehen und liefe bei jedem Vitest-Lauf.
 *
 * ⚠️ DIE KLAMMERTIEFE WIRD MITGEZAEHLT, und ohne sie waere dieser Scan auf
 * KORREKTEM Code rot. Eine Action mit destrukturiertem erstem Parameter steht
 * im Bestand so formatiert:
 *
 *     export async function artikelSpeichern({
 *       id,
 *       name,
 *     }: Eingabe) {
 *
 * Die ERSTE Zeile endet bereits auf `{` — ein naives „erste Zeile, die auf `{`
 * endet" naehme `id,` als erste Anweisung, faende keinen Riegel und meldete eine
 * richtig geschriebene Action. GENAU DAS ist die Sorte Fehlalarm, wegen der
 * Scans abgeschaltet werden, und sie schlaege in Teil 4/5 zu, wo niemand mehr
 * weiss, warum. Deshalb zaehlt `tiefe` die runden Klammern ab der Deklaration
 * mit: als Rumpfbeginn gilt nur ein `{` am Zeilenende, das bei Tiefe 0 steht —
 * die Parameterliste ist dann geschlossen.
 *
 * Wir schneiden bei der naechsten Deklaration auf Spaltenebene ab (`\nexport `
 * oder `\nfunction `/`\nconst `/`\nclass ` am Zeilenanfang) — genau genug, um die
 * ERSTE Anweisung zu sehen, und robust gegen alles, was in einem Rumpf steht.
 */
function rumpfNach(quelle: string, abIndex: number): string {
  const rest = quelle.slice(abIndex);
  const ende = rest.slice(1).search(/\n(?:export|function|const|class)\s/);
  const abschnitt = ende === -1 ? rest : rest.slice(0, ende + 1);
  const zeilen = abschnitt.split("\n");

  let tiefe = 0;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]!;
    for (const z of zeile) {
      if (z === "(") tiefe++;
      else if (z === ")") tiefe--;
    }
    // Rumpfbeginn: die Zeile endet auf `{` UND die Parameterliste ist zu.
    if (tiefe <= 0 && zeile.trimEnd().endsWith("{")) return zeilen.slice(i + 1).join("\n");
  }
  return "";
}

/** Erste bedeutungstragende Zeile: Leerzeilen und Kommentare werden uebersprungen. */
function ersteAnweisung(rumpf: string): string {
  const zeilen = rumpf.split("\n");
  let imBlockkommentar = false;
  for (const roh of zeilen) {
    const z = roh.trim();
    if (imBlockkommentar) {
      if (z.includes("*/")) imBlockkommentar = false;
      continue;
    }
    if (z === "") continue;
    if (z.startsWith("//")) continue;
    if (z.startsWith("/*")) {
      if (!z.includes("*/")) imBlockkommentar = true;
      continue;
    }
    return z;
  }
  return "";
}

/**
 * Entfernt aus einer einzelnen Zeile alles, was der Riegel-Nachweis NICHT
 * ausloesen darf: Zeichenkettenliterale (Inhalt UND Anfuehrungszeichen) und
 * einen nachgestellten `//`- oder `/* ... *\/`-Kommentar.
 *
 * `ersteAnweisung` erkennt nur Zeilen, die VOLLSTAENDIG ein Kommentar sind —
 * ein nachgestellter Kommentar auf der ersten Anweisung selbst (`return x; //
 * TODO requireLagerbuchAdmin(`) oder ein Zeichenkettenliteral, das den
 * Riegelnamen als Text enthaelt (`console.log("requireLagerbuchAdmin( ...")`),
 * ueberlebt sonst unveraendert bis zum RIEGEL-Test — und weil RIEGEL
 * unverankert ist, matcht er dort genauso wie bei einem echten Aufruf. Diese
 * Funktion laeuft NUR vor dem RIEGEL-Test; die Fehlermeldung zeigt weiterhin
 * die rohe Zeile, damit ein genau solcher Kommentar sichtbar bleibt.
 *
 * Bewusst NICHT verankert am Zeilenanfang: `const viewer = await
 * requireLagerbuchAdmin();` ist die legitime erste Anweisung, der Riegel darf
 * also irgendwo in der bereinigten Zeile stehen.
 */
function ohneKommentareUndZeichenketten(zeile: string): string {
  let ergebnis = "";
  let i = 0;
  while (i < zeile.length) {
    const z = zeile[i]!;
    if (z === '"' || z === "'" || z === "`") {
      i++;
      while (i < zeile.length && zeile[i] !== z) {
        if (zeile[i] === "\\") i++;
        i++;
      }
      i++; // schliessendes Anfuehrungszeichen ueberspringen
      continue;
    }
    if (z === "/" && zeile[i + 1] === "/") break; // Rest der Zeile ist Kommentar
    if (z === "/" && zeile[i + 1] === "*") {
      const ende = zeile.indexOf("*/", i + 2);
      i = ende === -1 ? zeile.length : ende + 2;
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis.trim();
}

type Fund = { datei: string; name: string; erste: string };

function exportierteActions(): Fund[] {
  const funde: Fund[] = [];
  for (const datei of actionDateien()) {
    const quelle = readFileSync(join(ORDNER, datei), "utf8");
    /**
     * `export type` und `export interface` treffen dieses Muster NICHT — sie
     * werden damit KONSTRUKTIV verworfen, nicht durch eine Filterzeile, die
     * jemand entfernen kann. `_actions/detail.ts` exportiert drei Typen neben
     * einer Action (§2.1 a).
     */
    const deklaration = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/gm;
    let m: RegExpExecArray | null;
    while ((m = deklaration.exec(quelle)) !== null) {
      // JE DATEI JE DEKLARATION, nie ueber ein Set der Namen: geraetSpeichern,
      // setGeraetAktiv und geraetZuBarcode stehen in bz.ts UND in geraete.ts —
      // ein Set ergaebe 41 statt 44 (§3.8.2).
      funde.push({ datei, name: m[1], erste: ersteAnweisung(rumpfNach(quelle, m.index)) });
    }
  }
  return funde;
}

describe("_actions/ — jede exportierte Action ist bewacht", () => {
  it("beginnt mit requireLagerbuchAdmin oder requireHelferSchreibend — oder steht auf der Liste", () => {
    // Der RIEGEL-Test laeuft gegen die BEREINIGTE Zeile (ohne nachgestellten
    // Kommentar, ohne Zeichenkettenliterale) — sonst zaehlt ein Kommentar oder
    // ein String mit dem Riegelnamen als Beleg, obwohl kein Riegel aufgerufen
    // wird. Die Fehlermeldung zeigt trotzdem die ROHE Zeile, damit genau so
    // ein Kommentar sichtbar bleibt statt verschluckt zu werden.
    const ungeschuetzt = exportierteActions()
      .filter((f) => !AUSNAHMEN.has(f.name))
      .filter((f) => !RIEGEL.test(ohneKommentareUndZeichenketten(f.erste)))
      .map((f) => `${f.datei}: ${f.name}() beginnt mit "${f.erste || "<leerer Rumpf>"}"`);

    expect(ungeschuetzt, [
      "Diese Actions tragen keinen Riegel als ERSTE Anweisung.",
      "Verwaltung → requireLagerbuchAdmin(); schreibender Helfer-Weg → requireHelferSchreibend(db).",
      "Eine Action hat KEINE Weiche — sie hat einen Aufrufer, der schon entschieden hat (§3.2.1).",
      "Ein Kommentar oder ein Zeichenkettenliteral mit dem Riegelnamen zaehlt NICHT als Beleg.",
    ].join("\n")).toEqual([]);
  });

  it("die Ausnahmeliste hat GENAU DREI Eintraege", () => {
    // Waechst sie, ist das ein roter Test und keine Zeile im Diff. Jeder der drei
    // ist im Kopfkommentar dieser Datei einzeln begruendet.
    expect([...AUSNAHMEN].sort()).toEqual(["beenden", "einloesenAmGate", "erneuereSitzung"]);
  });

  it("kennt an einem Zeilenanfang mit `export` NUR die eine Action-Bauform und Typ-Exporte", () => {
    /**
     * DIE PRUEFUNG IST INVERTIERT, UND DAS IST DER GANZE PUNKT.
     *
     * Bis hierher erkannte diese Datei Actions ueber MUSTER („sieht das nach
     * einer Pfeilfunktion aus?"). Gegen sechs Bauformen gemessen war sie bei
     * VIEREN blind — und zwar STILL:
     *
     *   export async function a(…)                GESEHEN
     *   export const b = async (…) => {…}          GESEHEN
     *   export const c = async function innen(…)   *** BLIND ***
     *   async function d(…) {} ; export { d }      *** BLIND ***
     *   export default async function e(…)         *** BLIND ***
     *   export const f = async fd => {…}           *** BLIND ***
     *
     * In einem "use server"-Modul wird JEDER Export zu einer Server Action mit
     * global aufrufbarer ID — auch `export { d }` und `export default`. `d` ist
     * die realistischste der vier: sie entsteht beilaeufig, wenn jemand eine
     * Sammel-Exportzeile ans Dateiende setzt.
     *
     * Vier weitere Erkennungs-Regexe waeren Whack-a-Mole; die fuenfte Bauform
     * rutschte genauso durch. Deshalb steht hier eine ALLOWLIST: gemeldet wird
     * jede Zeile, die mit `export` beginnt und KEINER anerkannten Form
     * entspricht. Neue Bauformen sind damit laut statt still — dieselbe Regel,
     * die `_lib/bauform.test.ts` fuer `ohneKommentare` selbst formuliert („Ein
     * Scan darf falsch-positiv sein und laut, nie falsch-negativ und still").
     *
     * ⚠️ EIN `export const FOO = 5` WIRD MITGEMELDET, UND DAS IST RICHTIG. Ein
     * "use server"-Modul darf ausschliesslich async-Funktionen exportieren; ein
     * Wert-Export dort ist selbst der Fehler. Konstanten gehoeren nach `_lib/`.
     *
     * ⚠️ DIESE DATEI IST BIS TEIL 6 EINGEFROREN (siehe Kopfkommentar). Die
     * Fehlermeldung unten ist damit der EINZIGE Kanal zu Teil 4 und Teil 5 — sie
     * nennt deshalb die REGEL, nicht nur den Verstoss.
     *
     * Gescannt wird die ROHE Zeile: eine Zeile, die in einem Blockkommentar bei
     * Spalte 0 mit `export` beginnt, meldet der Scan mit. Falsch-positiv, laute
     * Richtung, hinnehmbar — Kommentare in diesem Modul sind eingerueckt.
     */
    const ERLAUBT = [
      /^export\s+(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*[(<]/, // die eine Action-Bauform
      /^export\s+(?:type|interface)\s/, // `_actions/detail.ts` exportiert drei Typen (§2.1 a)
    ];
    const fremdformen: string[] = [];
    for (const datei of actionDateien()) {
      readFileSync(join(ORDNER, datei), "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          if (!/^export\b/.test(zeile)) return;
          if (ERLAUBT.some((muster) => muster.test(zeile))) return;
          fremdformen.push(`${datei}:${i + 1}: ${zeile.trim()}`);
        });
    }
    expect(
      fremdformen,
      [
        "In _actions/ ist an einem Zeilenanfang mit `export` nur zweierlei erlaubt:",
        "  export [async] function name(…)   — die Action-Bauform, die der Guard-Scan lesen kann",
        "  export type / export interface    — Typen",
        "ALLES ANDERE wird gemeldet, auch wenn es harmlos aussieht:",
        "  `export { … }` und `export default` erzeugen in einem \"use server\"-Modul",
        "  ebenfalls eine Action mit GLOBAL aufrufbarer ID — nur sieht der Riegel-Test",
        "  oben sie nicht, und dann ist eine ungeschuetzte Action gruen.",
        "  `export const FOO = 5` ist in einem \"use server\"-Modul selbst ein Fehler:",
        "  ein Action-Modul exportiert ausschliesslich async-Funktionen. Konstanten",
        "  gehoeren nach _lib/.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("kommt selbst ohne _actions/ aus — die Zahlen stehen im describe „Zaehlung“", () => {
    // ⚠️ DIESE ZUSICHERUNG IST EINGELOEST, NICHT UEBERHOLT. Bis T172 stand hier
    // die Begruendung, warum in DIESEM Block noch keine Zahl steht; T172 hat die
    // Zahlen ergaenzt — aber am Dateiende, in einem EIGENEN describe, und nicht
    // hier hinein. Der Grund ueberlebt die Einloesung: dieser Block darf keine
    // Zahl tragen, sonst faellt bei einer fehlenden Datei die EIGENSCHAFT mit
    // aus, und man sieht in der Ausgabe nicht mehr, ob die vorhandenen Actions
    // ihren Riegel tragen. Getrennte Bloecke, getrennte Befunde.
    expect(Array.isArray(actionDateien())).toBe(true);
  });
});

/**
 * DIE ZAEHLUNG (Teil 1, F4; Spec §2.1 a, §3.8.2) — ergaenzt von Teil 6, T172.
 *
 * WAS DIE EIGENSCHAFT OBEN NICHT SIEHT: eine Action, die es gar nicht erst in
 * den Ordner geschafft hat. Sie prueft jede Datei, DIE DA IST. Erst die Zahl
 * macht das Fehlen sichtbar — und eine ZUSAETZLICHE Ausnahme ebenso: „waechst
 * die Liste, ist das ein roter Test und keine Zeile im Diff" (§3.8.2).
 *
 * DIE ZAHLEN SIND HERGELEITET, NICHT UEBERNOMMEN. Sollliste ist die Abbildung
 * Alt→Neu aus Spec §2.1 a — 16 Alt-Dateien mit 44 Deklarationen, dazu `gate.ts`
 * und `sitzung.ts` mit den drei Ausnahmen:
 *
 *   artikel 3 · aussondern 1 · bestellung 1 · buchung 3 · bz 4 · check 1 ·
 *   csv 1 · detail 1 · fahrzeuge 5 · geraete 3 · inventur 1 ·
 *   lagerortVerfall 1 · loeschen 3 · sauerstoff 3 · templates 11 · tokens 2
 *   = 44
 *   + gate 1 + sitzung 2 = 47,  davon 44 bewacht + 3 Ausnahmen
 *   44 bewacht = 42 requireLagerbuchAdmin + 2 requireHelferSchreibend
 *   18 Action-Dateien, dazu diese Testdatei als 19.
 *
 * ⚠️ Teil 5 §6 nennt „14 Dateien mit 32 Actions" und Teil 4 E10 „4 Dateien mit
 * 5 Exporten" — BEIDE RECHNEN FALSCH, und eine Zahl, die auf einem der beiden
 * ruht, waere rot, ohne dass man wuesste, welcher Plan zu wenig geliefert hat.
 * Aufgeloest in Plan-Teil 6, §4.2.
 *
 * ⚠️ ES GIBT HIER KEINEN TESTFALL „verwirft exportierte Konstanten" (Ruling A1,
 * Betreiberentscheidung). Der Brief sah ihn vor, weil T160 vier Konstanten aus
 * `"use server"`-Dateien exportieren sollte; sie liegen stattdessen in
 * `_lib/tokenForm.ts`. Unter `_actions/` gibt es keine exportierte Konstante —
 * der Testfall haette kein Subjekt. Verboten bleibt es trotzdem: der
 * Allowlist-Scan oben („kennt an einem Zeilenanfang mit `export` NUR die eine
 * Action-Bauform und Typ-Exporte") meldet jedes `export const FOO = 5`.
 *
 * ⚠️ ES GIBT KEINEN ZWEITEN PARSER. Alles unten liest `exportierteActions()`
 * aus dem Block oben — dieselbe Erkennung, dieselbe Klammertiefe, derselbe
 * Kommentar-/Zeichenketten-Stripper. Der Brief nannte `ACTIONS`,
 * `actionsIn(datei)` und `rumpfVon(quelle, name)` als Helfer „aus Teil 2, T20";
 * keiner der drei existiert (Ruling B10). Vorhanden sind `ORDNER`,
 * `actionDateien()`, `exportierteActions()`, `rumpfNach(quelle, abIndex)` und
 * `ersteAnweisung()` — und `rumpfNach` sucht nach POSITION, nicht nach Namen.
 */
describe("Zaehlung (§2.1 a)", () => {
  /**
   * Die Sollliste, Datei fuer Datei. Sie steht HIER und nicht im Modul — sonst
   * prueft der Test den Code gegen sich selbst und bliebe auch bei einer
   * fehlenden Datei gruen.
   *
   * ⚠️ Die Summen unten (47, 44, 3, 42, 2) stehen ABSICHTLICH als Literale da
   * und werden NICHT aus dieser Tabelle gerechnet. Zwei unabhaengige Anker:
   * SOLL bindet je Datei, die Literale binden die Summe. Ein
   * `Object.values(SOLL).reduce(...)` waere immer gruen.
   */
  const SOLL: Record<string, number> = {
    "artikel.ts": 3,
    "aussondern.ts": 1,
    "bestellung.ts": 1,
    "buchung.ts": 3,
    "bz.ts": 4,
    "check.ts": 1,
    "csv.ts": 1,
    "detail.ts": 1,
    "fahrzeuge.ts": 5,
    "gate.ts": 1,
    "geraete.ts": 3,
    "inventur.ts": 1,
    "lagerortVerfall.ts": 1,
    "loeschen.ts": 3,
    "sauerstoff.ts": 3,
    "sitzung.ts": 2,
    "templates.ts": 11,
    "tokens.ts": 2,
  };

  /** Die Deklarationen EINER Datei — aus dem einen Scan, in Fundreihenfolge. */
  function actionsIn(funde: Fund[], datei: string): string[] {
    return funde.filter((f) => f.datei === datei).map((f) => f.name);
  }

  const ADMIN = /requireLagerbuchAdmin\s*\(/;
  const HELFER = /requireHelferSchreibend\s*\(/;

  it("hat 18 Action-Dateien plus `guards.test.ts`", () => {
    // ⚠️ NICHT `readdirSync(ORDNER).toHaveLength(19)` (Ruling A7): der Ordner
    // hat 37 Eintraege. Gezaehlt werden die ACTION-Dateien; `guards.test.ts`
    // wird separat nachgewiesen, weil `actionDateien()` sie ausfiltert.
    const dateien = actionDateien();
    expect(Object.keys(SOLL), "Die Sollliste selbst nennt 18 Dateien.").toHaveLength(18);
    expect(dateien, "18 Action-Dateien, namentlich").toEqual(Object.keys(SOLL).sort());
    expect(existsSync(join(ORDNER, SELBST)), `${SELBST} liegt daneben.`).toBe(true);
  });

  it("hat je Datei genau so viele Deklarationen wie die Sollliste sagt", () => {
    const funde = exportierteActions();
    for (const [datei, n] of Object.entries(SOLL)) {
      expect(actionsIn(funde, datei), datei).toHaveLength(n);
    }
  });

  /**
   * GEZAEHLT WIRD JE DATEI JE DEKLARATION, NIE UEBER EIN SET DER NAMEN.
   * `geraetSpeichern`, `setGeraetAktiv` und `geraetZuBarcode` stehen in `bz.ts`
   * UND in `geraete.ts` — gleicher Name, verschiedene Tabellen (`bz_geraete`
   * gegen `geraete`), verschiedene Felder. Ein Set ergaebe 41 statt 44. Die
   * beiden Dateien werden NICHT zusammengelegt.
   *
   * Die dritte Zusicherung nennt die Dubletten NAMENTLICH: „47 gegen 44" allein
   * waere auch dann gruen, wenn es drei ganz andere Dubletten gaebe.
   */
  it("zaehlt 47 Deklarationen, obwohl es nur 44 verschiedene Namen gibt", () => {
    const namen = exportierteActions().map((f) => f.name);
    expect(namen, "47 Deklarationen").toHaveLength(47);
    expect(new Set(namen).size, "44 verschiedene Namen").toBe(44);

    const doppelt = [...new Set(namen)]
      .filter((n) => namen.filter((x) => x === n).length > 1)
      .sort();
    expect(doppelt, "GENAU DIESE DREI stehen doppelt — in bz.ts und in geraete.ts.").toEqual([
      "geraetSpeichern",
      "geraetZuBarcode",
      "setGeraetAktiv",
    ]);
  });

  it("bewacht 44 und listet genau 3 Ausnahmen", () => {
    const funde = exportierteActions();
    const ausnahmen = funde.filter((f) => AUSNAHMEN.has(f.name));
    // Das ist NICHT dieselbe Aussage wie „die Ausnahmeliste hat GENAU DREI
    // Eintraege" oben: dort wird die KONSTANTE geprueft, hier, wie viele der
    // 47 GEFUNDENEN Deklarationen auf ihr stehen. Ein vierter Eintrag mit dem
    // Namen einer echten Action faerbt beide rot; ein Eintrag mit einem Namen,
    // den es nicht gibt, nur den oberen.
    expect(ausnahmen.map((f) => `${f.datei}#${f.name}`), "genau 3 Ausnahmen").toHaveLength(3);
    expect(funde.length - ausnahmen.length, "44 bewacht").toBe(44);
  });

  it("nennt die drei Ausnahmen namentlich und in ihren Dateien", () => {
    // SOLL bindet nur die ANZAHL je Datei. Erst hier haengt der Name an der
    // Datei: eine Ausnahme, die nach `artikel.ts` wandert, faellt sonst nicht auf.
    const funde = exportierteActions();
    expect(actionsIn(funde, "gate.ts")).toEqual(["einloesenAmGate"]);
    expect(actionsIn(funde, "sitzung.ts").sort()).toEqual(["beenden", "erneuereSitzung"]);
  });

  /**
   * `export type` IST KEINE ACTION. `detail.ts` exportiert neben `getDetail`
   * DREI Typen (ArtikelDetailCharge, ArtikelDetailBuchung, ArtikelDetailResult).
   * Wer sie mitzaehlt, liest drei ungeschuetzte Actions, die keine sind — und
   * „repariert" dann drei Typdeklarationen mit einem Riegel.
   *
   * Die Regex liest `type` UND `interface` und ankert wie `ERLAUBT` am
   * Zeilenanfang: eine der drei nach `interface` umzuschreiben ist dort erlaubt
   * und darf hier nicht rot werden.
   *
   * ⚠️ Fundort ohne Zeilennummer, mit Absicht: `ERLAUBT` steht im describe
   * „_actions/ — jede exportierte Action ist bewacht", Zusicherung „kennt an
   * einem Zeilenanfang mit `export` NUR die eine Action-Bauform und
   * Typ-Exporte". Eine Zeilennummer veraltet beim naechsten Einschub darueber.
   */
  it("verwirft `export type` und `export interface`", () => {
    const quelle = readFileSync(join(ORDNER, "detail.ts"), "utf8");
    expect(quelle.match(/^export\s+(?:type|interface)\s+\w+/gm) ?? []).toHaveLength(3);
    expect(actionsIn(exportierteActions(), "detail.ts")).toEqual(["getDetail"]);
  });

  /**
   * DREI DER 44 LESEN NUR UND BLEIBEN TROTZDEM ACTIONS: `getDetail`,
   * `pruefeLoeschbar` und `geraetZuBarcode` (ZWEIMAL, je Datei). Sie stehen hier
   * und nicht unter `_lib/lesepfade/`, weil ihr einziger Aufrufer jeweils eine
   * Client-Insel ist (§2.1 a, Punkt 4). Sie zaehlen mit und tragen einen Riegel.
   */
  it("zaehlt die vier nur lesenden Deklarationen mit", () => {
    const funde = exportierteActions();
    for (const [datei, name] of [
      ["detail.ts", "getDetail"],
      ["loeschen.ts", "pruefeLoeschbar"],
      ["geraete.ts", "geraetZuBarcode"],
      ["bz.ts", "geraetZuBarcode"],
    ] as const) {
      expect(actionsIn(funde, datei), `${datei}#${name}`).toContain(name);
    }
  });

  /**
   * 42 tragen `requireLagerbuchAdmin`, 2 `requireHelferSchreibend`.
   *
   * Geprueft wird die ERSTE ANWEISUNG (`Fund.erste`), nicht der ganze Rumpf: der
   * Brief wollte `rumpfVon(quelle, name).includes(...)`, aber `rumpfVon` gibt es
   * nicht (Ruling B10) — und die erste Anweisung ist ohnehin die staerkere
   * Fassung, weil genau sie der Eigenschafts-Block oben bindet. Ein
   * `requireHelferSchreibend` IRGENDWO im Rumpf waere keine Wache.
   *
   * Durch `ohneKommentareUndZeichenketten`, sonst zaehlt ein Kommentar oder ein
   * Zeichenkettenliteral mit dem Riegelnamen als Beleg (Stripper-Regel, positive
   * Zusicherung).
   */
  it("verteilt die 44 Riegel auf 42 requireLagerbuchAdmin und 2 requireHelferSchreibend", () => {
    const bewacht = exportierteActions().filter((f) => !AUSNAHMEN.has(f.name));
    const bereinigt = (f: Fund) => ohneKommentareUndZeichenketten(f.erste);

    const helfer = bewacht.filter((f) => HELFER.test(bereinigt(f)));
    const admin = bewacht.filter((f) => ADMIN.test(bereinigt(f)));

    expect(helfer.map((f) => `${f.datei}#${f.name}`).sort(), "der schreibende Helfer-Weg").toEqual([
      "buchung.ts#bucheEntnahmeHelfer",
      "check.ts#checkAbschluss",
    ]);
    expect(admin, "alle uebrigen tragen requireLagerbuchAdmin").toHaveLength(42);
  });
});
