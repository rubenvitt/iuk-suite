import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

/** Jede `loading.tsx` unter `dir`, relativ zum Modul. */
function ladegrenzen(dir: string): string[] {
  const gefunden: string[] = [];
  (function suche(d: string): void {
    for (const eintrag of readdirSync(d)) {
      const pfad = join(d, eintrag);
      if (statSync(pfad).isDirectory()) suche(pfad);
      else if (eintrag === "loading.tsx") gefunden.push(relative(__dirname, pfad));
    }
  })(dir);
  return gefunden.sort();
}

const COCKPIT = join(__dirname, "(admin)", "groups", "[groupId]", "(cockpit)");

/**
 * DIE LADEGRENZEN VON feedback (DRK-424) — und es gibt genau EINE.
 *
 * Bis DRK-424 verbot `docs/design/feedback-admin.md` §4.5 jede `loading.tsx`:
 * „die Seite rendert serverseitig in einem Zug". Das stimmt nur unter
 * `next dev`. In Produktion wird eine dynamische Route MIT Grenze vorabgeladen
 * und die Adresse wechselt sofort; ohne sie wartete der Klick auf eine
 * Gruppenkarte gemessen 432 ms ohne jede Reaktion (mit: 47 ms). Die Messung
 * und der Preis stehen am Bauteil, `core/shell/SeiteLaedt.tsx`.
 *
 * ⛔ EINE LISTE UND KEIN FREIBRIEF. Bewusst OHNE Grenze, je mit Grund:
 *   - Trend: nur ueber einen Knopf mit `href` erreichbar, also ein harter
 *     Aufruf — dort wird nichts vorabgeladen.
 *   - Auswertung: bleibt ohne JavaScript lesbar; eine Grenze machte sie dort
 *     zum Dauer-Ladezustand.
 *   - Aushang: eine Druckflaeche.
 *   - `f/…` und `f/…/thanks`: oeffentlich, per QR-Code oder Formular-Umleitung
 *     erreicht, 20–25 ms, und ausdruecklich ohne JavaScript bedienbar
 *     (`docs/design/feedback-oeffentliche-ansicht.md`).
 *
 * ⚠️ `toEqual` AUF DER SORTIERTEN LISTE, nicht `toContain`: nur so faellt
 * auch eine ZUSAETZLICHE Datei auf (dieselbe Bauform wie lagerbuch
 * `error.test.tsx`).
 */
describe("feedback: Ladegrenzen", () => {
  it("liegt GENAU um das Cockpit", () => {
    expect(
      ladegrenzen(__dirname),
      "Eine neue Ladegrenze in feedback braucht eine Messung gegen build/start und "
        + "eine Entscheidung (DRK-424) — und dann einen Eintrag hier.",
    ).toEqual(["(admin)/groups/[groupId]/(cockpit)/loading.tsx"]);
  });

  /**
   * ⛔ DIE ROUTENGRUPPE TRAEGT NUR DIE COCKPIT-SEITE. Eine `loading.tsx` deckt
   * ihr Segment und alles darunter; ein Unterverzeichnis in `(cockpit)/`
   * liefe also still unter die Grenze — genau der Fall, den die Gruppe
   * verhindern soll (unmittelbar unter `[groupId]` blitzte der Ladezustand
   * beim Weg zur Auswertung nur 75 ms auf).
   */
  it("legt nichts unter die Cockpit-Grenze ausser dem Cockpit", () => {
    const eintraege = readdirSync(COCKPIT).sort();
    expect(eintraege.filter((e) => statSync(join(COCKPIT, e)).isDirectory())).toEqual([]);
    expect(eintraege).toContain("page.tsx");
  });

  /**
   * ⛔ OHNE DEN SCHUTZ DAVOR IST DER 404 EIN 200. Unter einer Ladegrenze ist
   * der Status schon gesendet, wenn die Seite `notFound()` ruft — CI hat es
   * am ersten Stand dieses Umbaus gefangen (IDOR-Guard: 200 statt 404). Der
   * Guard MUSS deshalb im Layout derselben Routengruppe laufen, das oberhalb
   * der Grenze rendert. Ein Quelltext-Scan, weil nur `build`/`start` oder ein
   * e2e-Lauf den Status sieht, kein DOM-Test.
   */
  it("prueft den Zugriff im Layout, also vor der Grenze", () => {
    const quelle = readFileSync(join(COCKPIT, "layout.tsx"), "utf8");
    expect(quelle).toMatch(/await guardPage\(/);
    expect(quelle).toMatch(/notFound\(\)/);
  });
});
