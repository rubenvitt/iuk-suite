import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MONATS_FENSTER, fensterAus } from "./trendfenster";

/**
 * DIE RSC-GRENZE, AN DER DIE TRENDSEITE MIT HTTP 500 GESTORBEN IST.
 *
 * `MONATS_FENSTER` stand in `_ui/Segment.tsx`, und diese Datei traegt in Zeile 1
 * `"use client"`. Eine Server Component, die daraus einen WERT importiert (keine
 * Komponente, keine Funktion), bekommt keinen Array, sondern eine
 * Client-Referenz — `.includes` gibt es darauf nicht. Ergebnis:
 *
 *   TypeError: MONATS_FENSTER.includes is not a function
 *     at fensterAus (trend/page.tsx:169)
 *
 * WAS DIESER TEST KANN UND WAS NICHT. Er kann NICHT das Verhalten pruefen: unter
 * Vitest sind Client- und Server-Module beide normale ES-Module, `"use client"`
 * ist dort ein wirkungsloser String. Ein Test, der die Konstante importiert und
 * `.includes` aufruft, waere auch VOR der Behebung gruen gewesen — er misst
 * nichts. Was er kann, ist die GEGENMASZNAHME festhalten: die Datei, in der die
 * Konstante liegt, traegt kein `"use client"`. Das sichtbare Ergebnis besitzt
 * der Playwright-Lauf (`e2e/mobil-admin.spec.ts`, „Trendseite antwortet mit
 * 200") — nur ein echter Next-Server hat eine RSC-Grenze.
 */
describe("Trendfenster", () => {
  it("liegt in einem Modul OHNE `use client`", () => {
    const quelle = readFileSync("src/app/m/feedback/_lib/trendfenster.ts", "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });

  it("wird von `_ui/Segment.tsx` nicht mehr exportiert", () => {
    // Der Rueckweg: exportierte Segment.tsx die Konstante erneut, koennte eine
    // Server Component sie wieder von dort holen und der 500er waere zurueck.
    const quelle = readFileSync("src/app/m/feedback/_ui/Segment.tsx", "utf8");
    expect(quelle).not.toMatch(/export\s+const\s+MONATS_FENSTER/);
  });

  it("kennt genau die drei Fenster aus dem Entwurf (§3.3)", () => {
    expect([...MONATS_FENSTER]).toEqual([6, 12, 24]);
  });

  it("klemmt alles Unbekannte auf 12 — ohne Fehlermeldung", () => {
    expect(fensterAus("6")).toBe(6);
    expect(fensterAus("24")).toBe(24);
    expect(fensterAus("7")).toBe(12);
    expect(fensterAus(undefined)).toBe(12);
    expect(fensterAus("nonsens")).toBe(12);
  });
});
