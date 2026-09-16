import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const { revalidiert } = vi.hoisted(() => ({
  revalidiert: [] as { pfad: string; art?: string }[],
}));
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string, art?: string) => { revalidiert.push({ pfad, art }); },
}));

const { BESTANDSFLAECHEN, revalidiereBestand } = await import("./revalidierung");

beforeEach(() => { revalidiert.length = 0; });

/**
 * DER WAECHTER ZU DRK-374 — „eine Liste ohne Waechter driftet genauso wie sechs
 * Listen."
 *
 * Er prueft VIER Eigenschaften, und jede fangt einen anderen Ausgang derselben
 * Geschichte ab:
 *
 *   1. JEDE FLAECHE IN DER LISTE GIBT ES. Ein Pfad, der auf keine Route zeigt,
 *      ist eine stille Null: `revalidatePath` nimmt ihn an und WIRFT NICHT
 *      (Falle 49). Eine umbenannte oder verschobene Route macht den Eintrag
 *      wirkungslos, ohne dass irgendetwas rot wird.
 *   2. JEDER BESTANDSSCHREIBER BENUTZT DIE LISTE. Das ist die Eigenschaft, um
 *      die es geht: ein neuer Schreiber mit eigener Liste ist genau der Ausgang,
 *      der dieses Ticket erzeugt hat.
 *   3. KEIN SCHREIBER NENNT EINEN LISTENPFAD NOCH EINMAL SELBST. Ohne das
 *      entstuende die zweite Liste NEBEN der ersten, und beide waeren gruen.
 *   4. JEDE SEITE, DIE BESTAND ODER BUCHUNGEN LIEST, STEHT IN DER LISTE. Das ist
 *      die Vollstaendigkeit in der Leserichtung — die Richtung, aus der alle
 *      vier Review-Funde kamen.
 *
 * ⚠️ DER NAHELIEGENDE WAECHTER IST WERTLOS, gemessen und nicht vermutet: ein
 * TRANSITIVER Lauf ueber den Importgraphen („beruehrt die Seite mittelbar
 * `buchungen` oder `chargen`?") meldet 37 von 38 Seiten — auch `bz/scan` und
 * `verwaltung/tokens` —, weil jede Seite ueber die Huelle an irgendeiner Action
 * haengt. Ein Waechter, der fast alles meldet, wird abgeschaltet statt
 * repariert. Eigenschaft 4 sieht deshalb nur die DIREKTEN Importe der
 * Seitendatei selbst; das ist zugleich die Bauform des Moduls (die Server
 * Component liest, die Client-Insel rendert).
 */

const MODUL = join(process.cwd(), "src/app/m/lagerbuch");
const PRAEFIX = "/m/lagerbuch";

/* ------------------------------------------------------------------ 0 ----- */

/**
 * DER SOLLWERT, AUSGESCHRIEBEN — UND ZWAR GENAU EINMAL IM GANZEN MODUL.
 *
 * ⚠️ WARUM ER HIER STEHT UND NICHT IN JEDEM ACTION-TEST. `buchung.test.ts`
 * fuehrte bis DRK-374 dieselbe Liste woertlich mit, mit der ausdruecklichen
 * Begruendung „ein Test, der dieselbe Konstante importiert, waere zu jeder
 * Aenderung gruen". Das Argument stimmt — aber es traegt nur EINMAL. Haette
 * jeder der sieben Schreibertests die Liste ausgeschrieben, waere „eine neue
 * Flaeche" wieder eine Aenderung an acht Stellen, nur diesmal in `*.test.ts`:
 * dieselbe Drift, ein Verzeichnis weiter.
 *
 * Deshalb: HIER woertlich (eine stille Aenderung an der Liste ist rot), in den
 * Action-Tests gegen die importierte Konstante (dort wird geprueft, DASS der
 * Schreiber sie nimmt, und welche ID er mitgibt).
 */
const SOLL = [
  "/m/lagerbuch/verwaltung",
  "/m/lagerbuch/verwaltung/artikel",
  "/m/lagerbuch/verwaltung/bestellung",
  "/m/lagerbuch/verwaltung/verfall",
  "/m/lagerbuch/verwaltung/journal",
  "/m/lagerbuch/verwaltung/lagerorte",
  "/m/lagerbuch/verwaltung/inventur",
  "/m/lagerbuch/verwaltung/fahrzeuge",
  "/m/lagerbuch/verwaltung/entnahmebox",
  "/m/lagerbuch/auffuellen",
  "/m/lagerbuch/helfer",
  "/m/lagerbuch/helfer/box",
  "/m/lagerbuch/helfer/check",
  "/m/lagerbuch/auffuellen/box",
  "/m/lagerbuch/verwaltung/fahrzeuge/[id]",
  "/m/lagerbuch/auffuellen/[artikelId]",
  "/m/lagerbuch/a/[artikelId]",
];

/** Die Muster daraus — sie und nur sie bekommen `"page"` als zweiten Parameter. */
const MUSTER = SOLL.filter((p) => p.includes("["));

describe("BESTANDSFLAECHEN — der ausgeschriebene Sollwert", () => {
  it("ist genau diese Liste, in dieser Reihenfolge", () => {
    expect([...BESTANDSFLAECHEN]).toEqual(SOLL);
  });
});

describe("revalidiereBestand — was tatsaechlich gerufen wird", () => {
  it("raeumt genau die Bestandsflaechen aus, in dieser Reihenfolge", () => {
    revalidiereBestand();
    expect(revalidiert.map((r) => r.pfad)).toEqual(SOLL);
  });

  it("gibt JEDEM Muster `\"page\"` mit — ohne den Parameter ist es kein Muster", () => {
    /*
     * ⚠️ DIE ZUSICHERUNG, AN DER DER ZWEITE CODEX-BEFUND HAENGT. Next verlangt
     * den zweiten Parameter fuer jeden Pfad mit dynamischem Segment
     * (`revalidatePath.md`); ohne ihn raeumt der Aufruf keine einzige der
     * Seiten aus, sondern zeigt auf einen Pfad, den es nicht gibt — und wirft
     * dabei NICHT (Falle 49). Genau still.
     */
    revalidiereBestand();
    for (const { pfad, art } of revalidiert) {
      expect(art, pfad).toBe(pfad.includes("[") ? "page" : undefined);
    }
    expect(MUSTER.length).toBeGreaterThan(0);
  });

  it("nimmt keine Argumente — eine ID waere wieder eine Teilmenge", () => {
    /*
     * Die Signatur IST die Zusicherung: solange `revalidiereBestand` eine ID
     * entgegennaehme, gaebe es einen Aufrufer, der nur SEINE Seite ausraeumt —
     * und die Fahrzeugseiten zeigen ueber `sollFuerFahrzeug` auch den
     * Handlager-Bestand, aendern sich also bei Schreibern ohne jedes Fahrzeug.
     */
    expect(revalidiereBestand.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ 1 ----- */

/**
 * Ein Routenpfad trifft eine Datei, wenn jedes Pfadstueck ein Verzeichnis ist —
 * ROUTENGRUPPEN UEBERSPRUNGEN. `verwaltung/(arbeit)/artikel` liegt auf der
 * Platte drei Ebenen tief und heisst im Browser trotzdem `verwaltung/artikel`;
 * wer das nicht aufloest, haelt jeden Verwaltungspfad faelschlich fuer tot.
 */
function routeExistiert(pfad: string): boolean {
  const stuecke = pfad.replace(`${PRAEFIX}/`, "").replace(PRAEFIX, "").split("/").filter(Boolean);
  let orte = [MODUL];
  for (const stueck of stuecke) {
    const naechste: string[] = [];
    for (const ort of orte) {
      if (existsSync(join(ort, stueck))) naechste.push(join(ort, stueck));
      // eine Routengruppe kostet kein Pfadstueck
      for (const e of readdirSync(ort)) {
        if (!e.startsWith("(") || !statSync(join(ort, e)).isDirectory()) continue;
        if (existsSync(join(ort, e, stueck))) naechste.push(join(ort, e, stueck));
      }
    }
    if (naechste.length === 0) return false;
    orte = naechste;
  }
  return orte.some((o) => existsSync(join(o, "page.tsx"))
    || readdirSync(o).some((e) => e.startsWith("(")
      && statSync(join(o, e)).isDirectory()
      && existsSync(join(o, e, "page.tsx"))));
}

describe("BESTANDSFLAECHEN — jede Flaeche gibt es", () => {
  it("nennt nur innere Pfade (Falle 49)", () => {
    for (const pfad of BESTANDSFLAECHEN) {
      expect(pfad.startsWith(`${PRAEFIX}`), pfad).toBe(true);
    }
  });

  it("nennt keinen Pfad zweimal", () => {
    expect(new Set(BESTANDSFLAECHEN).size).toBe(BESTANDSFLAECHEN.length);
  });

  it("nennt keine eingesetzte ID — ein Detailschirm steht als MUSTER drin", () => {
    /*
     * Die Gegenrichtung zur ersten Fassung: dort war ein `[`-Segment verboten
     * und die ID kam vom Aufrufer. Verboten ist jetzt die eingesetzte ID —
     * eine Interpolation (`${…}`) oder ein Pfadstueck, das wie ein Wert
     * aussieht, waere wieder eine Teilmenge.
     */
    for (const pfad of BESTANDSFLAECHEN) {
      expect(pfad.includes("$"), pfad).toBe(false);
    }
  });

  it("zeigt fuer jeden Eintrag auf eine vorhandene Route", () => {
    for (const pfad of BESTANDSFLAECHEN) {
      expect(routeExistiert(pfad), `${pfad} zeigt auf keine page.tsx`).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------- 2 + 3 --- */

const ACTIONS = join(MODUL, "_actions");

/**
 * WAS EIN BESTANDSSCHREIBER IST — an der Sache erkannt, nicht an einer
 * gepflegten Namensliste: eine Action-Datei, die eine Buchungszeile oder eine
 * Charge schreibt. Entweder unmittelbar (`insert(buchungen)`, `update(chargen)`)
 * oder ueber einen der vier Schreibpfade, die es fuer sie tun.
 *
 * ⚠️ `loeschen.ts` FAELLT ABSICHTLICH HERAUS und liest beide Tabellen trotzdem:
 * es ZAEHLT sie, um ueber die Loeschbarkeit zu entscheiden, und loescht danach
 * nur Stammdaten. Deshalb steht hier `insert`/`update` und nicht der blosse
 * Tabellenname — die Unterscheidung ist Schreiben gegen Lesen.
 */
const SCHREIBT = /(?:insert\(\s*(?:buchungen|chargen)\s*\)|update\(\s*chargen\s*\)|schreibpfade\/(?:abbuchung|zugang|umlagerung|korrektur)")/;

function actionDateien(): { name: string; text: string }[] {
  return readdirSync(ACTIONS)
    .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && !n.endsWith(".spec.ts"))
    .map((n) => ({ name: n, text: readFileSync(join(ACTIONS, n), "utf8") }));
}

describe("_actions/ — jeder Bestandsschreiber benutzt die eine Liste", () => {
  const schreiber = actionDateien().filter((d) => SCHREIBT.test(d.text));

  it("findet ueberhaupt Schreiber (sonst prueft der Scan nichts)", () => {
    expect(schreiber.map((d) => d.name).sort()).toEqual([
      "aussondern.ts",
      "aussondernLagerort.ts",
      "buchung.ts",
      "check.ts",
      "csv.ts",
      "entnahmebox.ts",
      "inventur.ts",
    ]);
  });

  it("ruft in jedem Schreiber `revalidiereBestand`", () => {
    for (const d of schreiber) {
      expect(d.text.includes("revalidiereBestand("), d.name).toBe(true);
    }
  });

  it("laesst keinen Schreiber einen Listenpfad noch einmal selbst nennen", () => {
    const doppelt: string[] = [];
    for (const d of schreiber) {
      for (const pfad of BESTANDSFLAECHEN) {
        // `"…/verwaltung"` darf nicht auf `"…/verwaltung/artikel"` anspringen
        if (d.text.includes(`revalidatePath("${pfad}")`)) doppelt.push(`${d.name}: ${pfad}`);
      }
    }
    expect(doppelt).toEqual([]);
  });
});

/* ------------------------------------------------------------------ 4 ----- */

/**
 * JEDE SEITE DES MODULS, EINZELN KLASSIFIZIERT — die Vollstaendigkeit in der
 * LESERICHTUNG.
 *
 * ⚠️ HIER STAND ZUERST EINE LISTE VON LESERFUNKTIONEN, und sie hat genau den
 * Fehler durchgelassen, gegen den sie gebaut war (Codex-Review zu PR #187):
 * `sollFuerFahrzeug` stand nicht darin, also fiel `/helfer/check` aus dem Scan
 * — eine Seite, die je Soll-Zeile `fahrzeugBestand` UND `handlagerBestand`
 * zeigt. Eine handgepflegte Liste von Funktionsnamen ist dieselbe Bauform wie
 * sieben handgepflegte Pfadlisten; sie driftet aus demselben Grund.
 *
 * ⚠️ DREI MECHANISCHE ERSATZFORMEN WURDEN GEMESSEN UND SIND ALLE UNBRAUCHBAR,
 * und das ist der Grund, warum hier eine Aufzaehlung steht statt eines Scans:
 *
 *   * TRANSITIV ueber den Importgraphen der Seite: 37 von 38 Seiten melden
 *     „liest Bestand", weil jede Seite ueber die Huelle an einer Action haengt.
 *   * MODULWEISE ueber `lesepfade/*` mit Huelle: 33 von 38 — `orte.ts` zieht
 *     `bestand.ts` herein, `bz`/`geraete`/`o2` ziehen `orte` herein.
 *   * FUNKTIONSWEISE als lexikalischer Aufrufgraph: findet `sollFuerFahrzeug`,
 *     verliert aber `artikelListe` und `journalEintraege`, weil eine Signatur
 *     mit `{` die Klammerzaehlung verschiebt.
 *
 * Die Grenze ist eine FACHLICHE: „steht auf dieser Seite eine Bestandszahl
 * oder eine Buchungszeile?" Gemessenes Beispiel, an dem jeder Scan scheitert:
 * der Checklisten-DRUCKBOGEN ruft ebenfalls `sollFuerFahrzeug`, wirft
 * `handlagerBestand` und `fahrzeugBestand` aber weg und druckt nur das Soll —
 * also KEIN Bestand, bei identischem Aufruf.
 *
 * Deshalb wird hier JEDE Seite benannt. Eine neue Seite ist ein ROTER TEST, bis
 * jemand sie einordnet; das ist der Punkt, und es ist die einzige Form, die
 * keine stille Luecke zulaesst.
 */
const SEITEN: Record<string, "bestand" | "kein-bestand"> = {
  /* — zeigt Bestand oder Buchungszeilen — */
  "/verwaltung": "bestand",
  "/verwaltung/artikel": "bestand",
  "/verwaltung/bestellung": "bestand",
  "/verwaltung/verfall": "bestand",
  "/verwaltung/journal": "bestand",
  "/verwaltung/lagerorte": "bestand",
  "/verwaltung/inventur": "bestand",
  "/verwaltung/fahrzeuge": "bestand",
  "/verwaltung/fahrzeuge/[id]": "bestand",
  "/verwaltung/entnahmebox": "bestand",
  "/auffuellen": "bestand",
  "/auffuellen/box": "bestand",          // `einraeumPosten` — die Posten IN der Kiste
  "/auffuellen/[artikelId]": "bestand",
  "/a/[artikelId]": "bestand",
  "/helfer": "bestand",
  "/helfer/box": "bestand",
  "/helfer/check": "bestand",

  /* — zeigt keinen: mit dem Grund, sonst ist die Einordnung wertlos — */
  "": "kein-bestand",                              // Gate, reine Anmeldung
  "/g/[code]": "kein-bestand",                     // Scan-Weiche auf ein Geraet
  "/o/[ortId]": "kein-bestand",                    // Scan-Weiche auf einen Ort
  "/helfer/ziel": "kein-bestand",                  // Zielwahl, nur Fahrzeugnamen
  "/verwaltung/bz": "kein-bestand",                // Beatmungsgeraete, eigener Stamm
  "/verwaltung/bz/[id]": "kein-bestand",
  "/verwaltung/bz/[id]/kontrolle": "kein-bestand",
  "/verwaltung/bz/scan": "kein-bestand",
  "/verwaltung/checks": "kein-bestand",            // Check-HISTORIE, kein Live-Bestand
  "/verwaltung/checks/[id]": "kein-bestand",       // liest den `ergebnis`-Schnappschuss
  "/verwaltung/geraete": "kein-bestand",           // Geraetestamm
  "/verwaltung/geraete/[id]": "kein-bestand",
  "/verwaltung/geraete/scan": "kein-bestand",
  "/verwaltung/import": "kein-bestand",            // nur das Formular
  "/verwaltung/inventur/verlauf": "kein-bestand",  // Laufhistorie; `inventur.ts` raeumt sie selbst
  "/verwaltung/inventur/verlauf/[id]": "kein-bestand",
  "/verwaltung/sauerstoff": "kein-bestand",        // Flaschendruck, keine Buchungszeile
  "/verwaltung/sauerstoff/[id]": "kein-bestand",
  "/verwaltung/tokens": "kein-bestand",            // Kaertchen
  "/verwaltung/vorlagen": "kein-bestand",          // Vorlagenstamm
  "/verwaltung/vorlagen/[id]": "kein-bestand",     // `artikelListe` nur als Auswahl (id/name/fach)
  "/verwaltung/checklisten": "kein-bestand",       // druckt das SOLL, nicht den Bestand
  "/verwaltung/etiketten": "kein-bestand",
  "/verwaltung/ortsetiketten": "kein-bestand",
};

function seitenDateien(): string[] {
  const gefunden: string[] = [];
  (function geh(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) geh(p);
      else if (e === "page.tsx") gefunden.push(p);
    }
  })(MODUL);
  return gefunden.sort();
}

/** Der Routenpfad einer Seitendatei — Routengruppen fallen weg. */
function routeVon(datei: string): string {
  return datei
    .slice(MODUL.length)
    .replace("/page.tsx", "")
    .replace(/\/\([^)]*\)/g, "");
}

describe("Vollstaendigkeit — jede Seite ist eingeordnet", () => {
  it("kennt genau die Seiten, die es auf der Platte gibt", () => {
    // BEIDE Richtungen: eine neue Seite fehlt hier, eine geloeschte steht zu
    // viel drin. Nur zusammen ist es eine Zusicherung ueber Vollstaendigkeit.
    expect(seitenDateien().map(routeVon).sort()).toEqual(Object.keys(SEITEN).sort());
  });

  it("hat jede Bestandsseite in der Liste", () => {
    const offen = Object.entries(SEITEN)
      .filter(([route, art]) => art === "bestand"
        && !BESTANDSFLAECHEN.includes(`${PRAEFIX}${route}`))
      .map(([route]) => route);
    expect(offen).toEqual([]);
  });

  it("haelt jede Nicht-Bestandsseite aus der Liste heraus", () => {
    const zuviel = Object.entries(SEITEN)
      .filter(([route, art]) => art === "kein-bestand"
        && BESTANDSFLAECHEN.includes(`${PRAEFIX}${route}`))
      .map(([route]) => route);
    expect(zuviel).toEqual([]);
  });

  it("nennt in der Liste nichts, was keine Seite ist", () => {
    for (const pfad of BESTANDSFLAECHEN) {
      expect(SEITEN[pfad.slice(PRAEFIX.length)], pfad).toBe("bestand");
    }
  });
});
