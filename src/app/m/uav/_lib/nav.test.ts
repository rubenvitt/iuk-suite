import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UAV_NAV } from "./nav";

/*
 * DER KOPPLUNGSFALL ZWISCHEN NAVIGATION UND ROUTEN.
 *
 * Die Pruefrage aus `docs/design/README.md` lautet: „fuehrt KEIN Weg dorthin, wo die
 * aufrufende Person nicht hindarf?" — und ihre Kehrseite: fuehrt jeder Weg ueberhaupt
 * irgendwohin? Ein Navigationseintrag auf eine Route, die es nicht gibt, ist ein 404
 * mit Einladung, und kein Tor sieht ihn: `href` ist eine Zeichenkette.
 *
 * ⛔ DIE ZUGRIFFSFRAGE STELLT SICH HIER NICHT: alle drei Eintraege haengen an
 * `(admin)/layout.tsx`, das `requireUavHost` UND `requireUavAdminPage` traegt — wer
 * die Leiste sieht, darf alle drei Ziele sehen. „Trainingsansicht" fuehrt in den
 * Teilnehmer-Zweig, der ohne SSO offensteht (`registry.ts`: `requiresAuth: false`).
 * Es gibt also keine Stufe, nach der zu filtern waere, und deshalb auch keine
 * Funktion wie `radioNav(stufe)`, sondern eine Konstante.
 *
 * ⛔ UEBER EINER LEEREN LISTE WAEREN ALLE `for`-FAELLE LEER-GRUEN. Die Fallzahl steht
 * deshalb als eigener Fall daneben (dieselbe Vorsichtsmassnahme wie in
 * `radio/_lib/nav.test.ts`).
 */

/** Die aeussere Pfadform → die Datei, die diese Route bedient. */
const ROUTEN: Record<string, string> = {
  "/admin": "src/app/m/uav/(admin)/admin/page.tsx",
  "/admin/katalog": "src/app/m/uav/(admin)/admin/katalog/page.tsx",
  "/": "src/app/m/uav/(teilnehmer)/page.tsx",
};

describe("UAV_NAV", () => {
  it("fuehrt genau drei Eintraege", () => {
    expect(UAV_NAV).toHaveLength(3);
  });

  it("zeigt mit jedem href auf eine Route, die es gibt", () => {
    for (const eintrag of UAV_NAV) {
      const datei = ROUTEN[eintrag.href];
      expect(datei, `kein bekanntes Ziel fuer ${eintrag.key} (${eintrag.href})`).toBeDefined();
      expect(existsSync(datei), `${datei} fehlt`).toBe(true);
    }
  });

  it("traegt die AEUSSERE Pfadform, nie die innere `/m/uav`", () => {
    for (const eintrag of UAV_NAV) {
      expect(eintrag.href.startsWith("/m/uav"), eintrag.key).toBe(false);
    }
  });

  it("setzt fuer jeden Eintrag ein Zeichen", () => {
    expect(UAV_NAV.filter((e) => e.ikon === undefined)).toEqual([]);
  });

  it("trennt die Trainingsansicht sichtbar von den Verwaltungszielen", () => {
    /*
     * DER EIGENTLICHE BEFUND, GEGEN DEN DIESER FALL STEHT: „Trainingsansicht" fuehrt
     * NICHT auf eine dritte Einstellflaeche, sondern aus der Verwaltung heraus. In
     * einer ununterschiedenen Reihe war das nicht ablesbar. Geprueft wird deshalb
     * nicht der Wortlaut der Ueberschriften, sondern die Aussage: der Eintrag steht
     * unter einer ANDEREN Ueberschrift als die beiden Verwaltungsziele, und beide
     * Ueberschriften sind gesetzt.
     */
    const abschnitt = (key: string) => UAV_NAV.find((e) => e.key === key)?.abschnitt;
    expect(abschnitt("teilnehmer")).toBeTruthy();
    expect(abschnitt("katalog")).toBe(abschnitt("teilnehmer"));
    expect(abschnitt("training")).toBeTruthy();
    expect(abschnitt("training")).not.toBe(abschnitt("teilnehmer"));
  });

  it("liegt in einem Modul OHNE `use client` — der Wert wird in RSC gelesen (Falle 6)", () => {
    /*
     * `(admin)/layout.tsx` ist eine Server Component. Traegt diese Datei je ein
     * `"use client"`, kaeme dort statt der Liste eine Client-Referenz an: HTTP 500
     * fuer jede Seite mit Navigation, und weder `build` noch `typecheck` noch ein
     * gerenderter Vitest sieht es (dort ist die Direktive ein wirkungsloser String).
     * Deshalb prueft dieser Fall den QUELLTEXT.
     */
    const quelle = readFileSync("src/app/m/uav/_lib/nav.ts", "utf8").trimStart();
    expect(quelle.startsWith('"use client"')).toBe(false);
    expect(quelle.startsWith("'use client'")).toBe(false);
  });
});
