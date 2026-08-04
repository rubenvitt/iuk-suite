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
 * ⚠️ EIGENSCHAFT, NICHT ZAEHLUNG. Diese Datei toleriert ein fehlendes oder leeres
 * `_actions/` und ist damit am ersten Tag gruen. Ein Scan, der `toHaveLength(44)`
 * von Anfang an behauptet, waere am ersten Tag rot und wuerde abgeschaltet statt
 * repariert.
 *
 *   Teil 2 (hier): die Eigenschaft.
 *   Teil 4 und Teil 5: fuellen den Ordner und fassen DIESE DATEI NICHT AN.
 *   Teil 6: ergaenzt die ZAEHLUNG — 47 Actions = 44 bewachte + 3 Ausnahmen,
 *           18 Action-Dateien, 19 Verzeichniseintraege (guards.test.ts selbst).
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

function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  return readdirSync(ORDNER)
    .filter((n) => n.endsWith(".ts") && n !== SELBST && !n.endsWith(".test.ts"))
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
     * die `_lib/bauform.test.ts:66-78` fuer sich selbst formuliert („Ein Scan
     * darf falsch-positiv sein und laut, nie falsch-negativ und still").
     *
     * ⚠️ EIN `export const FOO = 5` WIRD MITGEMELDET, UND DAS IST RICHTIG. Ein
     * "use server"-Modul darf ausschliesslich async-Funktionen exportieren; ein
     * Wert-Export dort ist selbst der Fehler. Konstanten gehoeren nach `_lib/`.
     *
     * ⚠️ DIESE DATEI IST BIS TEIL 6 EINGEFROREN (siehe Kopf, `:25`). Die
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

  it("ist am ersten Tag gruen, auch ohne _actions/ — und sagt, wer ihn verschaerft", () => {
    // Teil 4 und Teil 5 fuellen den Ordner; TEIL 6 ergaenzt die Zaehlung
    // (47 = 44 + 3, 18 Dateien, 19 Verzeichniseintraege). Diese Zusicherung ist
    // die Begruendung dafuer, dass hier NOCH keine Zahl steht.
    expect(Array.isArray(actionDateien())).toBe(true);
  });
});
