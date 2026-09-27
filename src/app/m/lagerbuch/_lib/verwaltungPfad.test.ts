import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nanoid, urlAlphabet } from "nanoid";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "./konstanten";
import {
  verwaltungDetailPfad,
  verwaltungDetailPfadIntern,
  type Detailflaeche,
} from "./verwaltungPfad";

/**
 * DEN PFAD SO LESEN, WIE DER BROWSER IHN LIEST — DRK-477, Vorbild `tokenZiel.test.ts`.
 * Ueber `URL`, nicht per `split` am rohen Text: nur so faellt ein `#` in der Id
 * als FRAGMENT auf, das beim Server nie ankommt.
 */
const wieDerBrowser = (pfad: string) => new URL(pfad, "https://lagerbuch.example.org");

const FLAECHEN: readonly Detailflaeche[] = [
  "fahrzeuge", "geraete", "bz", "checks", "vorlagen", "sauerstoff", "inventur/verlauf",
];

/** Ids, die ein von Hand bearbeiteter oder importierter Bestand tragen KOENNTE. */
const TRENNZEICHEN_IDS = ["rtw#1", "a?b=1", "a/b", "a&x=1", "100%", "rtw 1", "a+b", "a%2Fb", "a:b"];

describe("verwaltungDetailPfad — eine Id kommt VOLLSTAENDIG auf ihrer Detailseite an", () => {
  it("die Lesart faengt den Riss ueberhaupt — Gegenprobe am alten, rohen Pfad", () => {
    // Ohne diese Zeile waere der Test darunter womoeglich blind.
    const roh = wieDerBrowser("/verwaltung/fahrzeuge/rtw#1");
    expect(roh.pathname).toBe("/verwaltung/fahrzeuge/rtw");
    expect(roh.hash).toBe("#1");
    expect(wieDerBrowser("/verwaltung/fahrzeuge/a/b").pathname.split("/")).toHaveLength(5);
  });

  it("jede Flaeche traegt die ganze Id in GENAU EINEM Pfadsegment", () => {
    for (const flaeche of FLAECHEN) {
      const kopf = ["", "verwaltung", ...flaeche.split("/")];
      for (const id of TRENNZEICHEN_IDS) {
        const url = wieDerBrowser(verwaltungDetailPfad(flaeche, id));
        const segmente = url.pathname.split("/");
        expect(segmente.slice(0, -1), `${flaeche} ${id}`).toEqual(kopf);
        expect(decodeURIComponent(segmente.at(-1)!), `${flaeche} ${id}`).toBe(id);
        expect(url.search + url.hash, `${flaeche} ${id}`).toBe("");
      }
    }
  });

  it("die Unterseite haengt HINTER der kodierten Id", () => {
    for (const id of TRENNZEICHEN_IDS) {
      const segmente = wieDerBrowser(verwaltungDetailPfad("bz", id, "kontrolle")).pathname.split("/");
      expect(segmente, id).toHaveLength(5);
      expect(decodeURIComponent(segmente[3]), id).toBe(id);
      expect(segmente[4], id).toBe("kontrolle");
    }
  });

  it("der innere Pfad ist derselbe, nur unter `/m/lagerbuch` (Falle 49)", () => {
    for (const id of ["f1", ...TRENNZEICHEN_IDS]) {
      expect(verwaltungDetailPfadIntern("fahrzeuge", id))
        .toBe(`/m/lagerbuch${verwaltungDetailPfad("fahrzeuge", id)}`);
      expect(verwaltungDetailPfadIntern("bz", id, "kontrolle"))
        .toBe(`/m/lagerbuch${verwaltungDetailPfad("bz", id, "kontrolle")}`);
    }
  });

  /**
   * DIE ZUSAGE, DIE DEN BESTAND SCHUETZT. Alt-Anwendung und Suite vergeben
   * diese Ids ueber `nanoid()` oder als feste Konstanten — fuer all diese Ids
   * ist der Pfad Zeichen fuer Zeichen der, den die Aufrufer bisher roh gebaut
   * haben. Lesezeichen und offene Tabs landen also genau wie vorher.
   */
  it("fuer nanoid-Ids und feste Konstanten ist der Pfad ZEICHENGLEICH mit dem rohen", () => {
    const ids = [urlAlphabet, HANDLAGER_ID, ENTNAHMEBOX_ID, ...Array.from({ length: 50 }, () => nanoid())];
    for (const flaeche of FLAECHEN) {
      for (const id of ids) {
        expect(verwaltungDetailPfad(flaeche, id)).toBe(`/verwaltung/${flaeche}/${id}`);
        expect(verwaltungDetailPfadIntern(flaeche, id)).toBe(`/m/lagerbuch/verwaltung/${flaeche}/${id}`);
      }
    }
    expect(verwaltungDetailPfad("bz", urlAlphabet, "kontrolle")).toBe(`/verwaltung/bz/${urlAlphabet}/kontrolle`);
    expect(ids).toHaveLength(53);
  });
});

/* ------------------------------------------------------------------------- */

const MODUL = join(process.cwd(), "src/app/m/lagerbuch");

function quelldateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((name) => {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) return name === "node_modules" ? [] : quelldateien(pfad);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [pfad] : [];
  });
}

/** Ein Verwaltungspfad, dessen naechstes SEGMENT eine Einsetzung ist (`/verwaltung/fahrzeuge/${…}`). */
const ROHES_SEGMENT = /\/verwaltung(\/[\w-]+)*\/\$\{/;

describe("verwaltungDetailPfad — der Waechter gegen die naechste rohe Zeile", () => {
  /**
   * JEDE FLAECHE GIBT ES ALS DETAILROUTE. Eine umbenannte Route liesse den
   * Typ sonst stehen, und jeder Link darauf waere ein 404.
   */
  it("jede Detailflaeche hat eine Route `…/[id]/page.tsx`", () => {
    for (const flaeche of FLAECHEN) {
      expect(existsSync(join(MODUL, "verwaltung/(arbeit)", flaeche, "[id]/page.tsx")), flaeche).toBe(true);
    }
    expect(existsSync(join(MODUL, "verwaltung/(arbeit)/bz/[id]/kontrolle/page.tsx"))).toBe(true);
  });

  /**
   * KEIN AUFRUFER BAUT EINE DETAILADRESSE MEHR SELBST. Gesucht wird die Form,
   * die DRK-477 ausgeloest hat: ein Verwaltungspfad, dem direkt eine
   * Einsetzung als Segment folgt (`/verwaltung/fahrzeuge/${…}`), und die
   * Kurzform ueber eine Listenkonstante (`${LISTENPFAD}/${…}`). Eine Abfrage
   * (`?fz=${encodeURIComponent(…)}`) trifft das Muster bewusst nicht.
   */
  it("kein Quelltext im Modul setzt eine Id roh in einen Verwaltungspfad", () => {
    const muster = [ROHES_SEGMENT, /\$\{(LISTENPFAD|FAHRZEUGE_PFAD)\}\/\$\{/];
    const funde = quelldateien(MODUL).filter((d) => !d.endsWith("verwaltungPfad.ts")).flatMap((datei) =>
      readFileSync(datei, "utf8").split("\n").flatMap((zeile, i) =>
        muster.some((m) => m.test(zeile)) ? [`${relative(MODUL, datei)}:${i + 1}  ${zeile.trim()}`] : []));
    expect(funde).toEqual([]);
  });

  it("die Suche findet die alte Form ueberhaupt — Gegenprobe", () => {
    expect(ROHES_SEGMENT.test("href={`/verwaltung/fahrzeuge/${zeile.id}`}")).toBe(true);
    expect(ROHES_SEGMENT.test("`/m/lagerbuch/verwaltung/inventur/verlauf/${id}`")).toBe(true);
    expect(ROHES_SEGMENT.test("`/verwaltung/checklisten?fz=${encodeURIComponent(id)}`")).toBe(false);
    expect(ROHES_SEGMENT.test("`/verwaltung/checklisten/pdf${anhang}`")).toBe(false);
  });
});
