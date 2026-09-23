import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { BODY_VARIANT_NAMEN } from "./bezeichnungen";
import {
  KATALOG_STAND,
  alleZeichen,
  findeZeichen,
  kapitelListe,
  sucheZeichen,
  zeichenIdAusPfad,
} from "./katalog";

const GENERAT = "src/app/m/zeichen/_lib/katalog.generiert.json";

/** Der lokale tsx — siehe die Messung unten, warum nicht ueber `pnpm exec`. */
const TSX = "node_modules/.bin/tsx";

/*
 * WARUM DIESE ZWEI FAELLE EIN EIGENES ZEITBUDGET BRAUCHEN (DRK-330, Fund aus DRK-299).
 *
 * Sie sind die einzigen der Datei, die einen KINDPROZESS starten — alle uebrigen 17
 * rechnen auf dem schon geladenen Generat und liegen bei 0 bis 13 ms. Ihre Kosten sind
 * deshalb nicht die 541 KB, die geschrieben werden, sondern der Start eines zweiten
 * Node-Prozesses samt Modulgraph des Katalogpakets.
 *
 * GEMESSEN (15.09.2026, Container mit 4 Kernen, Node 22.22.2, Vitest 4.1.11):
 *   – beide Faelle einzeln, noch ueber `pnpm exec`: 1491 ms und 1487 ms
 *   – dieselben Faelle unter der VOLLEN Suitenlast (647 Dateien, 10 932 Faelle,
 *     399 s Gesamtdauer): 1551 ms und 1562 ms — die Last allein traegt also nur ~4 %.
 *     Die Kosten sind der Prozessvorlauf, nicht die Gleichzeitigkeit.
 *   – der Generatorlauf nackt auf der Kommandozeile: 610 ms direkt gegen 1490 ms ueber
 *     `pnpm exec`. Diese ~880 ms sind reiner pnpm-Vorlauf, zweimal je Lauf; deshalb
 *     ruft der Test unten `node_modules/.bin/tsx` direkt auf. Die Ausgabe beider Wege
 *     wurde byteweise verglichen — identisch. Der dokumentierte Weg fuer Menschen
 *     bleibt `pnpm exec tsx scripts/zeichen-generat.ts`.
 *   – nach dieser Umstellung IN VITEST: 658 ms und 646 ms, die ganze Datei 2,03 s
 *     statt 3,69 s. Das ist der Wert, gegen den die Grenze unten zu lesen ist.
 *
 * WARUM 20 000 MS UND NICHT DIE 5 S DER VORGABE: DRK-299 hat die Vorgabe zweimal
 * reissen sehen — Vitest parallel zu Playwright unter Volllast. Isoliert ist die Datei
 * dort gruen geblieben, was genau die Falle ist: der Ausfall haengt an der Maschine,
 * nicht an der Aenderung, die ihn ausloest. Die CI verstaerkt rechen- und
 * dateilastige Dateien dieses Repos um Faktor 1,5 bis 7 (nicht um 30 bis 125 wie
 * commit-lastige SQLite-Dateien; die Messreihe steht in `files/_lib/seedLokal.test.ts`
 * und `lagerbuch/_lib/seedLokal.test.ts`). Auf den Lastwert VOR der Umstellung
 * angewandt sind das 1562 ms × 7 = 10,9 s — ueber der Vorgabe und unter dieser Zahl.
 * Absichtlich der alte Wert: die 5 s wurden mit ihm gerissen, und eine Grenze, die nur
 * mit der Beschleunigung haelt, waere beim naechsten langsameren Kindprozess wieder
 * faellig. 20 000 ms sind damit rund das Dreissigfache des heute gemessenen
 * Lastwertes und rund das Doppelte der schlechtesten Projektion. Es ist ABSICHTLICH
 * dieselbe Zahl wie in den beiden anderen Ausnahmen des Repos: eine dritte, eigene
 * Konstante waere schwerer zu pruefen als eine wiederholte.
 *
 * ⚠️ EINE BEOBACHTUNG, DIE DIE ZAHL NICHT TRAEGT, aber ein spaeterer Leser kennen
 * sollte: der allererste Generatorlauf in diesem frisch bereitgestellten Container
 * dauerte 21 648 ms — das Vierzehnfache aller spaeteren. Der Seitencache ist NICHT die
 * Ursache (nach `drop_caches` lief derselbe Aufruf in 1700 ms), und nach dem ersten Mal
 * liess sich der Wert im selben Container nicht wieder herstellen. Wahrscheinlich holt
 * das Wurzeldateisystem dieser Sandbox Bloecke beim ersten Zugriff nach. Eine
 * unaufgeklaerte Einzelbeobachtung aus einer Sandbox ist kein Fundament fuer eine
 * Grenze — sonst waere die Zahl genau der Zufallswert, den dieses Ticket verhindern
 * will. Wer sie in der echten CI wiedersieht, hat hier den Anknuepfungspunkt.
 *
 * ⛔ Die Zahl gilt NUR fuer den EINEN Generatorlauf (seit DRK-348 das `beforeAll` von
 * „Generatorlauf" — beide Faelle lesen dessen Ergebnis), nicht fuer die Datei und nicht
 * global. Die uebrigen 17 Faelle dieser Datei bleiben bei 5 s, und der globale
 * `testTimeout` bleibt es auch; ihn heraufzusetzen wuerde jeden kuenftigen Fall
 * derselben Art verdecken. Nachgeprueft statt angenommen: mit Grenze 1 ms faellt genau
 * die Gruppe „Generatorlauf" (ihre zwei Faelle uebersprungen), die anderen 17 bleiben gruen.
 */
const KINDPROZESS_BUDGET = { timeout: 20_000 };

/** Unter dem Budget, damit der Kindprozess mit eigener Meldung endet, bevor Vitest abbricht. */
const KINDPROZESS_GRENZE_MS = 18_000;

const execFileAsync = promisify(execFile);

/** Das Generat ohne den einzigen nichtdeterministischen Wert. */
const ohneDatum = (roh: string) => {
  const o = JSON.parse(roh) as { stand: Record<string, unknown> };
  delete o.stand.erzeugtAm;
  return JSON.stringify(o);
};

describe("Katalog-Generat", () => {
  /*
   * EIN GENERATORLAUF FUER BEIDE ZUSICHERUNGEN (DRK-348). Waechter und Gegenprobe bauten
   * frueher je ein eigenes Generat — zweimal derselbe Kindprozess je Lauf, und unter
   * Verbundlast kippte mal der eine, mal der andere. Jetzt baut `beforeAll` einmal, und
   * die beiden Faelle lesen nur noch das Ergebnis. Gemessen: 1249 + 668 ms vorher.
   *
   * ASYNCHRON, NICHT `execFileSync`: ein synchroner Aufruf blockiert die Ereignisschleife,
   * Vitests Zeitgrenze kann ihn nicht unterbrechen, und der Kindprozess liefe nach einem
   * Abbruch weiter. `timeout` am Kindprozess liegt unter dem Budget und sagt ausdruecklich,
   * dass eine ZEITGRENZE gerissen ist — kein Inhaltsunterschied (Akzeptanzkriterium).
   *
   * ⚠️ DER LAUF SCHREIBT IN EINEN WEGWERFPFAD UND FASST DIE EINGECHECKTE DATEI NICHT AN.
   * Schriebe er dorthin, heilte der Waechter sich selbst: ein veraltetes Generat waere
   * genau EINMAL rot — derselbe Lauf, der die Abweichung meldet, haette sie schon
   * weggeschrieben —, und der zweite Lauf gruen, ohne dass jemand etwas repariert hat.
   * Nebenbei bleibt so der Arbeitsbaum nach `pnpm vitest run` sauber (`erzeugtAm`
   * wechselt taeglich) und kein paralleler Worker liest eine halb geschriebene Datei.
   */
  describe("Generatorlauf", () => {
    let lauf: { probe: string; vorher: string; nachher: string };

    beforeAll(async () => {
      const ordner = mkdtempSync(join(tmpdir(), "zeichen-generat-"));
      try {
        const probe = join(ordner, "katalog.probe.json");
        const vorher = readFileSync(GENERAT, "utf8");
        try {
          await execFileAsync(TSX, ["scripts/zeichen-generat.ts", probe], {
            timeout: KINDPROZESS_GRENZE_MS,
          });
        } catch (fehler) {
          if ((fehler as { killed?: boolean }).killed) {
            throw new Error(
              `ZEITGRENZE, kein Inhaltsunterschied: der Generatorlauf brauchte laenger als ` +
                `${KINDPROZESS_GRENZE_MS} ms und wurde abgebrochen. Datei einmal allein ` +
                `nachfahren, bevor der Lauf als Befund gilt (DRK-348).`,
            );
          }
          throw fehler;
        }
        lauf = {
          probe: readFileSync(probe, "utf8"),
          vorher,
          nachher: readFileSync(GENERAT, "utf8"),
        };
      } finally {
        rmSync(ordner, { recursive: true, force: true });
      }
    }, KINDPROZESS_BUDGET.timeout);

    /*
     * DER WAECHTER. Das Generat wird bei JEDEM Lauf neu gebaut und byteweise verglichen.
     * Damit ist Drift zwischen eingechecktem Stand und installiertem Paket strukturell
     * ausgeschlossen, nicht nur geregelt.
     */
    it("entspricht dem installierten Paket", () => {
      expect(ohneDatum(lauf.probe)).toBe(ohneDatum(lauf.vorher));
    });

    /*
     * Die Gegenprobe zum Waechter: er darf die Quelle NICHT veraendern. Waere das anders,
     * hinterliesse jeder Testlauf einen schmutzigen Arbeitsbaum — und der Waechter oben
     * pruefte am Ende nur noch sich selbst.
     */
    it("laesst das eingecheckte Generat unangetastet", () => {
      expect(lauf.nachher).toBe(lauf.vorher);
    });
  });

  /*
   * BESTANDSZUSICHERUNG. Diese Zahl wird beim Paketupgrade ANGEHOBEN, nicht geloescht
   * — dieselbe Regel wie bootstrap.test.ts:718. Sie ist die einzige Stelle, an der ein
   * verschwundenes Zeichen ueberhaupt auffaellt, bevor jemand danebensteht.
   */
  it("fuehrt 246 Zeichen: 232 Hauptrezepte und 14 Grundzeichen", () => {
    expect(KATALOG_STAND.anzahl).toBe(246);
    expect(alleZeichen().length).toBe(246);
    expect(alleZeichen().filter((z) => z.id.startsWith("grund:")).length).toBe(
      14,
    );
  });

  it("traegt Paket-, Datenversion und Erzeugungstag", () => {
    expect(KATALOG_STAND.paket).toBe("1.1.0");
    expect(KATALOG_STAND.daten).toBe("0.2.0");
    expect(KATALOG_STAND.erzeugtAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /*
   * ANKER — die namentliche Liste aller IDs, die `_lib/seedLokal.ts` benutzt. Ohne
   * diesen Test liefen Seed und Katalog nach einem Upgrade auseinander, und der Seed
   * schriebe Merkzeilen auf IDs, die es nicht mehr gibt.
   */
  const ANKER = [
    "rezept:C.1.1",
    "rezept:E.1.1",
    "rezept:I.3.5",
    "grund:base.formation",
  ];
  it.each(ANKER)("loest die Anker-ID %s auf", (id) => {
    expect(findeZeichen(id)).not.toBeNull();
  });

  /*
   * `findeZeichen` gibt null zurueck und wirft NIE — anders als RECIPES[k]
   * (liefert still undefined) und anders als composeFromCatalog (wirft). Eine
   * unbekannte ID ist hier ein ZUSTAND, kein Fehler: gespeicherte Merkzeilen und
   * Lernstaende zeigen auf IDs, die ein Upgrade entfernt haben kann.
   */
  it("liefert null statt zu werfen", () => {
    expect(findeZeichen("rezept:GIBTSNICHT")).toBeNull();
    expect(() => findeZeichen("")).not.toThrow();
  });

  it("schreibt nirgends das Wort undefined in einen Anwendertext", () => {
    for (const z of alleZeichen()) {
      expect(z.bedeutung, z.id).not.toContain("undefined");
      expect(z.antwort, z.id).not.toContain("undefined");
    }
  });

  /*
   * GEMESSEN drei echte Titelkollisionen ueber sechs IDs (Mehrzweckboot,
   * Mehrzweckarbeitsboot, Mehrzweckponton — je Hilfsorganisation gegen THW). Die
   * zehn #alternative sind KEINE Kollision: sie tragen denselben Titel wie ihr
   * Hauptschluessel, weil es dasselbe Zeichen ist.
   */
  it("markiert genau sechs IDs als mehrdeutig und macht ihre Antworten eindeutig", () => {
    expect(alleZeichen().filter((z) => z.mehrdeutigerTitel).length).toBe(6);
    expect(new Set(alleZeichen().map((z) => z.antwort)).size).toBe(246);
  });

  /*
   * M11: renderSvg ohne idPrefix erzeugt auf jeder Kachelflaeche dieselbe DOM-ID
   * (`ez-title`/`ez-desc`). Auf einer Seite mit 24 Zeichen sind das 24 Kollisionen —
   * optisch faellt nichts auf, und kein Gate sieht es. Reine Stringarbeit, deshalb hier
   * pruefbar.
   */
  it("vergibt eindeutige SVG-IDs ueber den ganzen Katalog", () => {
    /*
     * „Ueber den ganzen Katalog" schliesst die zehn zweiten Darstellungen ein — sie
     * stehen auf der Detailflaeche NEBEN der ersten, also genau dort, wo doppelte
     * DOM-IDs zusammentreffen. Wer hier nur `z.svg` liest, prueft die eine Naht nicht,
     * an der die Kollision am wahrscheinlichsten ist (getrennt gehalten allein durch
     * den Praefix `tz-alt-`). Gemessen: 512 IDs aus 256 SVGs, keine doppelt.
     */
    const ids = alleZeichen()
      .flatMap((z) => [z.svg, z.zweiteDarstellung?.svg])
      .filter((s): s is string => typeof s === "string")
      .flatMap((s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    expect(ids.length).toBe(512);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("kennt fuer jede vorkommende Koerperform einen deutschen Namen", () => {
    const varianten = new Set(
      alleZeichen()
        .map((z) => (z.spec as { bodyVariant?: string } | null)?.bodyVariant)
        .filter((v): v is string => typeof v === "string"),
    );
    const ohne = [...varianten].filter((v) => !(v in BODY_VARIANT_NAMEN));
    expect(ohne).toEqual([]);
  });
});

describe("sucheZeichen", () => {
  it("findet ueber die Umlautfaltung", () => {
    expect(
      sucheZeichen({ text: "loeschgruppe" }).treffer.length,
    ).toBeGreaterThan(0);
    expect(sucheZeichen({ text: "sanitaet" }).treffer.length).toBeGreaterThan(
      0,
    );
  });

  it("schraenkt auf eine ID-Liste ein, wenn `nur` gesetzt ist", () => {
    const zwei = ["rezept:C.1.1", "rezept:E.1.1"];
    expect(
      sucheZeichen({ nur: zwei })
        .treffer.map((z) => z.id)
        .sort(),
    ).toEqual(zwei);
  });

  it("liefert Kapitel mit Zaehlung", () => {
    const k = kapitelListe();
    expect(k.length).toBeGreaterThan(20);
    expect(k.reduce((s, e) => s + e.anzahl, 0)).toBe(246);
  });
});

/*
 * ⚠️ GEMESSEN AM 2026-09-03 GEGEN `next dev` (Next 16.3.3, Turbopack), NICHT
 * VERMUTET: `/m/zeichen/katalog/[id]` bekommt seinen `params.id` PROZENTKODIERT.
 * Der Abruf von `/katalog/rezept%3AC.1.1` lieferte HTTP 404, und ein
 * Debug-Log in der Seite zeigte `params.id = "rezept%3AC.1.1"` — mit
 * `findeZeichen(...) === null`. Dasselbe Bild bei einem LITERALEN Doppelpunkt in
 * der Adresse (`/katalog/rezept:C.1.1`): auch dort steht `%3A` im Parameter.
 *
 * Der Aufgabenbrief ging vom Gegenteil aus („der von Next dekodierte
 * `params.id`"). Ohne diese Umkehr waere die Detailseite fuer JEDE Zeichen-Id
 * mit Doppelpunkt — also fuer alle 246 — dauerhaft 404 gewesen, und kein Tor
 * haette es gesehen: `typecheck`, `lint`, `build` und Vitest kennen die
 * Parameterkodierung eines echten Requests nicht.
 */
describe("zeichenIdAusPfad", () => {
  it("dekodiert den prozentkodierten Doppelpunkt, den Next im Parameter liefert", () => {
    expect(zeichenIdAusPfad("rezept%3AC.1.1")).toBe("rezept:C.1.1");
    expect(findeZeichen(zeichenIdAusPfad("rezept%3AC.1.1"))).not.toBeNull();
  });

  it("laesst eine bereits dekodierte Id unveraendert — der Aufruf ist idempotent", () => {
    expect(zeichenIdAusPfad("rezept:C.1.1")).toBe("rezept:C.1.1");
  });

  /*
   * `decodeURIComponent("%")` wirft `URIError`. Ein Wurf auf dem Seitenpfad
   * waere HTTP 500 fuer eine kaputte Adresse — 404 ist die richtige Antwort,
   * und die kommt von `findeZeichen`, wenn hier der Rohwert durchgereicht wird.
   * Vorbild: `lagerbuch/_lib/barcode.ts`.
   */
  it("wirft nicht an einer kaputten Prozentfolge, sondern reicht sie durch", () => {
    expect(zeichenIdAusPfad("%")).toBe("%");
    expect(zeichenIdAusPfad("%ZZ")).toBe("%ZZ");
    expect(findeZeichen(zeichenIdAusPfad("%"))).toBeNull();
  });
});
