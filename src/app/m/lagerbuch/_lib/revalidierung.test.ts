import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const { revalidiert } = vi.hoisted(() => ({ revalidiert: [] as string[] }));
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
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
];

describe("BESTANDSFLAECHEN — der ausgeschriebene Sollwert", () => {
  it("ist genau diese Liste, in dieser Reihenfolge", () => {
    expect([...BESTANDSFLAECHEN]).toEqual(SOLL);
  });
});

describe("revalidiereBestand — was tatsaechlich gerufen wird", () => {
  it("raeumt ohne IDs genau die Bestandsflaechen aus", () => {
    revalidiereBestand();
    expect(revalidiert).toEqual(SOLL);
  });

  it("haengt die Detailschirme hinten an, wenn die IDs da sind", () => {
    revalidiereBestand({ artikelId: "art-1", lagerortId: "fz-1" });
    expect(revalidiert).toEqual([
      ...SOLL,
      "/m/lagerbuch/a/art-1",
      "/m/lagerbuch/auffuellen/art-1",
      "/m/lagerbuch/verwaltung/fahrzeuge/fz-1",
    ]);
  });

  it("laesst `null` und `undefined` weg, statt einen Pfad mit Luecke zu bauen", () => {
    revalidiereBestand({ artikelId: null, lagerortId: undefined });
    expect(revalidiert).toEqual(SOLL);
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

  it("nennt keinen Platzhalter — ein Pfad mit ID gehoert an die Aufrufstelle", () => {
    for (const pfad of BESTANDSFLAECHEN) {
      expect(pfad.includes("["), pfad).toBe(false);
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
 * DIE LESER — die Funktionen, deren Ergebnis sich mit JEDER Buchung aendert.
 *
 * Kuratiert, und die Kuratierung ist selbst bewacht: der Test unten verlangt,
 * dass jeder Name in seinem Modul auch exportiert wird. Eine Umbenennung faellt
 * damit auf, statt den Scan still leerlaufen zu lassen.
 *
 * ⚠️ NICHT DRIN, obwohl es danach aussieht: `verfallFuerLagerort` und
 * `lagerortVerfallListe` lesen `lagerort_verfall` — eine GEMELDETE Verfallszahl
 * je Ort, keine Charge und keinen Saldo. Eine Buchung aendert sie nicht.
 */
const LESER: Record<string, string[]> = {
  "_lib/lesepfade/artikel": [
    "artikelListe", "artikelDetailHelfer", "artikelDetailAuffuellen",
    "chargenJeArtikelAmLagerort",
  ],
  "_lib/lesepfade/bestand": [
    "kennzahlen", "bestandJeArtikelImBereich", "bestandJeArtikelAnOrt",
    "restJeChargeImBereich", "restJeChargeAnOrt", "restJeChargeJeOrtImBereich",
    "bestandJeArtikelUndLagerort", "restJeChargeFuerArtikelImBereich",
    "restJeChargeFuerArtikelAnOrt", "restJeChargeUndOrt", "verteilungJeCharge",
  ],
  "_lib/lesepfade/verfall": ["verfallListe"],
  "_lib/lesepfade/journal": ["journalEintraege"],
  "_lib/lesepfade/inventur": ["inventurZeilen"],
  "_lib/lesepfade/entnahmebox": ["boxInhalt", "postenAmOrt", "letzteBoxZugaenge"],
  "_lib/lesepfade/bestellung": ["bestellvorschlag"],
  "_lib/lesepfade/fahrzeuge": ["fahrzeugUebersicht"],
  "_db/schema": ["buchungen", "chargen"],
};

/**
 * DIE EINZIGE AUSNAHME, und sie ist gemessen: `vorlagen/[id]` ruft
 * `artikelListe`, nimmt daraus aber NUR `id`, `name` und `fach` — die Auswahl
 * fuer eine Vorlagenposition. Es zeigt keine Bestandszahl, also veraltet dort
 * auch keine. Waechst diese Liste, ist das eine Entscheidung im Diff und kein
 * Nebenbei.
 */
const AUSNAHMEN = new Set(["/verwaltung/vorlagen/[id]"]);

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

function liestBestand(text: string): string[] {
  const treffer: string[] = [];
  const muster = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g;
  for (const m of text.matchAll(muster)) {
    const modul = Object.keys(LESER).find((k) => m[2].endsWith(k));
    if (!modul) continue;
    for (const teil of m[1].split(",")) {
      const name = teil.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (LESER[modul].includes(name)) treffer.push(name);
    }
  }
  return treffer;
}

describe("Vollstaendigkeit — jede lesende Flaeche steht in der Liste", () => {
  it("nennt in LESER nur Namen, die es gibt", () => {
    for (const [modul, namen] of Object.entries(LESER)) {
      const text = readFileSync(join(MODUL, `${modul}.ts`), "utf8");
      for (const name of namen) {
        expect(new RegExp(`export (?:function|const) ${name}\\b`).test(text), `${modul}: ${name}`)
          .toBe(true);
      }
    }
  });

  it("deckt jede Seite ab, die einen dieser Leser direkt importiert", () => {
    const offen: string[] = [];
    for (const datei of seitenDateien()) {
      const gelesen = liestBestand(readFileSync(datei, "utf8"));
      if (gelesen.length === 0) continue;
      const route = routeVon(datei);
      if (AUSNAHMEN.has(route)) continue;
      // Eine Route mit Platzhalter wird an der Aufrufstelle mit ihrem Wert
      // revalidiert; die Liste kennt sie nicht und darf es nicht.
      if (route.includes("[")) continue;
      if (!BESTANDSFLAECHEN.includes(`${PRAEFIX}${route}`)) {
        offen.push(`${route} liest ${gelesen.join(", ")}`);
      }
    }
    expect(offen).toEqual([]);
  });

  it("haelt die Ausnahmen klein und gueltig", () => {
    const routen = new Set(seitenDateien().map(routeVon));
    for (const a of AUSNAHMEN) expect(routen.has(a), a).toBe(true);
    expect(AUSNAHMEN.size).toBeLessThanOrEqual(1);
  });
});
