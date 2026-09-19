// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, queryAll } from "@/app/m/qr/_lib/test-dom";
import { SeiteLaedt } from "./SeiteLaedt";

const MODUL = join(__dirname, "..");
const QUELLE = join(__dirname, "SeiteLaedt.tsx");

afterEach(async () => {
  await unmount();
});

/**
 * DIE BAUFORM DES LADEZUSTANDS (DRK-201).
 *
 * ⚠️ WAS DIESE DATEI AUSDRUECKLICH NICHT BELEGT: dass die Ladegrenze WIRKT.
 * Vorabladen gibt es nur in Produktion; die Testsuite faehrt gegen `next dev`
 * und kann den Unterschied strukturell nicht sehen. Der Beleg liegt in einem
 * `build`/`start`-Lauf. Wer einen gruenen Lauf hier fuer den Nachweis haelt,
 * haelt eine Bauform fuer eine Wirkung.
 *
 * ⛔ WAS SIE SEHR WOHL BELEGT, und das ist die Haelfte, die weh taete: dass der
 * Ladezustand die Seite nicht UMBRINGT. Eine `loading.tsx` ist eine Server
 * Component — ein Compound-Zugriff auf antd oder ein Zeichenimport ergaebe dort
 * HTTP 500, und zwar genau in dem Moment, in dem der Ladezustand greifen soll.
 * `typecheck`, `build` und ein DOM-Test sehen das strukturell nicht; nur ein
 * Quelltext-Scan sieht es, dieselbe Bauform wie `core/shell/icons.test.ts`.
 */
describe("lagerbuch-SeiteLaedt: die Bauform", () => {
  it("traegt kein use client — sonst kaeme sie als Client-Referenz an", () => {
    const erste = readFileSync(QUELLE, "utf8").split("\n")[0].trim();
    expect(erste).not.toMatch(/^["']use client["'];?$/);
  });

  /**
   * ⛔ DIE ZWEI FALLEN IN EINEM FALL, und sie sind gegenlaeufig: ein
   * Compound-Zugriff (`Skeleton.Button`, `Card.Meta`) ist in einer Server
   * Component `undefined`, und ein Import aus dem antd-Zeichenpaket wirft schon
   * beim Import. Beide enden in HTTP 500 auf der Seite, die gerade laedt.
   */
  it("nennt weder einen Compound-Zugriff noch das Zeichenpaket", () => {
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).not.toMatch(/@ant-design\/icons/);
    // `Name.Teil<` oder `Name.Teil ` als JSX-Element — der Compound-Zugriff.
    expect(quelle).not.toMatch(/<[A-Z][A-Za-z]*\.[A-Z]/);
  });

  it("rendert antds Ladeflaechen, nicht eine leere Huelle", async () => {
    await mount(<SeiteLaedt />);
    /*
     * ⚠️ GEPRUEFT WIRD DIE GERENDERTE KLASSE, NICHT DIE PROP. Ein `loading` an
     * der falschen Stelle — oder eine `Card` ohne es — waere typkorrekt und
     * zeigte eine leere Karte: kein Fehler, nur keine Rueckmeldung. Genau der
     * stille Ausfall, gegen den die Grenze ueberhaupt steht.
     */
    expect(queryAll(".ant-card-loading").length).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⛔ DIE SIEBEN LADEGRENZEN BENUTZEN DIESES BAUTEIL — UND NUR DIESES.
   *
   * Ohne diesen Fall waere die ganze Begruendung oben wertlos: sie steht EINMAL
   * am Bauteil, und eine `loading.tsx`, die ihr eigenes Markup mitbraechte,
   * umginge jede Zusicherung dieser Datei, ohne dass ein Tor rot wuerde. Sieben
   * handgepflegte Fassungen liefen ausserdem auseinander, und die erste, die es
   * taete, faenge niemand: ein Ladezustand steht nie lange genug auf dem
   * Schirm, als dass jemand ihn pruefte.
   */
  it("jede loading.tsx des Moduls reicht genau dieses Bauteil durch", () => {
    const grenzen: string[] = [];
    (function suche(dir: string): void {
      for (const eintrag of readdirSync(dir)) {
        const pfad = join(dir, eintrag);
        if (statSync(pfad).isDirectory()) suche(pfad);
        else if (eintrag === "loading.tsx") grenzen.push(pfad);
      }
    })(MODUL);

    expect(grenzen.length, "keine Ladegrenze gefunden — der Scan waere leer-gruen").toBe(7);

    const abweichend: string[] = [];
    for (const pfad of grenzen) {
      const quelle = readFileSync(pfad, "utf8");
      if (!/\bSeiteLaedt\b/.test(quelle)) {
        abweichend.push(`${relative(MODUL, pfad)}: nennt SeiteLaedt nicht`);
      }
      if (/@ant-design\/icons/.test(quelle)) {
        abweichend.push(`${relative(MODUL, pfad)}: nennt das Zeichenpaket`);
      }
      if (/^["']use client["'];?$/.test(quelle.split("\n")[0].trim())) {
        abweichend.push(`${relative(MODUL, pfad)}: traegt use client`);
      }
    }
    expect(abweichend).toEqual([]);
  });
});
