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
 */
const ORDNER = join(process.cwd(), "src/app/m/radio/_actions");
const SELBST = join(ORDNER, "guards.test.ts");

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

const RIEGEL = /\brequireRadioAdmin\s*\(|\brequireAusleihSchreibend\s*\(/;
const HOST_RIEGEL = /\brequireRadioHost\s*\(/;

function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  return readdirSync(ORDNER)
    .filter((d) => /\.ts$/.test(d) && !/\.(?:test|spec)\.ts$/.test(d))
    .map((d) => join(ORDNER, d))
    .filter((p) => p !== SELBST);
}

/*
 * ⛔ HIER STEHEN DIE ZWEI ECHTEN FUNKTIONEN, WOERTLICH KOPIERT AUS `riegel.test.ts:148-213`
 * (`ohneKommentare` und `ohneKommentareUndZeichenketten`, mit ihren Kommentaren).
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
 * Die exportierten FUNKTIONEN einer Datei, je mit ihrem Koerperausschnitt.
 *
 * ⛔ `export type` UND `export interface` WERDEN VERWORFEN (Spec:6762). Ohne das waere
 * der Scan auf `AusleihErgebnis` und `RueckgabeErgebnis` rot-by-construction — und der
 * naheliegende Fix waere, den Scan abzuschwaechen.
 *
 * ⛔ GEZAEHLT WIRD JE DATEI JE DEKLARATION, NIE UEBER EIN `Set` DER NAMEN (Spec:6762):
 * zwei gleichnamige Exporte in zwei Dateien fielen sonst zu einem zusammen, und einer
 * bliebe unbewacht.
 */
function exportierteActions(quelle: string): { name: string; koerper: string }[] {
  const q = ohneKommentareUndZeichenketten(quelle);
  const treffer = [...q.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)\s*\(/g)];
  return treffer.map((t, i) => ({
    name: t[1]!,
    koerper: q.slice(t.index!, treffer[i + 1]?.index ?? q.length),
  }));
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

  it("keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel", () => {
    const verstoesse: string[] = [];
    for (const pfad of actionDateien()) {
      const datei = relative(ORDNER, pfad);
      const quelle = readFileSync(pfad, "utf8");
      for (const { name, koerper } of exportierteActions(quelle)) {
        const schluessel = `${datei}#${name}`;
        if ((AUSNAHMEN as readonly string[]).includes(schluessel)) {
          /*
           * ⛔ EINE AUSNAHME IST KEINE FREISTELLUNG. Alle drei Ausnahmen tragen
           * `requireRadioHost` als erste Anweisung (Spec:6762, §3.5.5 Spec:2774) —
           * die eine Ausnahme vom Grundsatz „Actions werfen nicht", weil ein Action-POST
           * auf falschem Host kein Betriebsfall ist, sondern ein manipulierter
           * (Spec:2360-2362).
           */
          if (!HOST_RIEGEL.test(koerper)) {
            verstoesse.push(`${schluessel}: Ausnahme OHNE requireRadioHost( (Spec:6762)`);
          }
          continue;
        }
        if (!RIEGEL.test(koerper)) {
          verstoesse.push(`${schluessel}: weder requireRadioAdmin( noch requireAusleihSchreibend(`);
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
         */
        const bindung =
          /\b(?:const|let)\s+(\w+|\{[^}]*\})\s*=\s*await\s+requireAusleihSchreibend\s*\(/
            .exec(koerper);
        if (/requireAusleihSchreibend\s*\(/.test(koerper) && !bindung) {
          verstoesse.push(
            `${schluessel}: requireAusleihSchreibend( ohne Bindung — das Ergebnis wird verworfen (Spec:2780-2784)`,
          );
        }
        if (bindung) {
          const rest = koerper.slice(bindung.index + bindung[0].length);
          const namen = gebundeneNamen(bindung[1]!);
          const gelesen = namen.some((n) => new RegExp(`\\b${n}\\b`).test(rest));
          if (!gelesen) {
            verstoesse.push(
              `${schluessel}: das Ergebnis von requireAusleihSchreibend( wird gebunden und nie gelesen (Spec:2780-2784)`,
            );
          }
        }
        /*
         * DER RIEGEL IST DIE ERSTE ANWEISUNG (Spec:2770, §4.2.1 Spec:3405-3406:
         * „als erste Anweisung, vor jedem Lesen von `formData`"). Gemessen wird ueber die
         * Textposition.
         *
         * ⛔ GEMESSEN WIRD IM RUMPF, NICHT IM `koerper`. `koerper` beginnt beim Wort
         * `export` und enthaelt damit die PARAMETERLISTE. Die bindenden Signaturen aus
         * A17 fuehren dort `formular: FormData` — ein Vergleich ueber den ganzen
         * `koerper` meldete fuer `ausleiheAnlegen` und `rueckgabeBuchen` IMMER „liest
         * formData VOR dem Riegel", bei richtiger Implementierung.
         * (`ohneKommentareUndZeichenketten` leert nur Kommentare und Literale;
         * Typannotationen bleiben stehen.)
         *
         * ⛔ ZUSAETZLICH VERENGT AUF LESEZUGRIFFE: nicht der NAME `formular` zaehlt,
         * sondern sein `.get(`. Beides zusammen, damit weder eine Annotation noch eine
         * Weitergabe als Argument faelschlich als „Lesen" gilt.
         */
        const rumpf = koerper.slice(koerper.indexOf("{"));
        const riegelPos = rumpf.search(RIEGEL);
        const formPos = rumpf.search(/\bform(?:Data|ular)\s*\.\s*get\b/);
        if (riegelPos !== -1 && formPos !== -1 && formPos < riegelPos) {
          verstoesse.push(`${schluessel}: liest formData VOR dem Riegel (§4.2.1)`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("jede Datei unter _actions/ traegt use server als erste Direktive", () => {
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
