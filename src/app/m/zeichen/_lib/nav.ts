import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION (Spec §2).
 *
 * KEIN `"use client"` (Falle 6): `(shell)/layout.tsx` ist eine Server Component und liest
 * diesen Wert. Aus einem Client-Modul kaeme dort eine Client-Referenz statt des Arrays an —
 * HTTP 500 fuer jede Seite mit Navigation, unsichtbar fuer `typecheck`, `build` und Vitest.
 * Vorbild: `lagerbuch/_lib/nav.ts`, `radio/_lib/nav.ts`, `uav/_lib/nav.ts`.
 *
 * DIE INNERE PFADFORM (`/m/zeichen/...`), ANDERS ALS BEI `lagerbuch`, `radio` UND `uav`. Jene
 * drei tragen die aeussere Form, weil sie nur unter ihrem eigenen Host bedient werden. Dieses
 * Modul muss beide Hosts koennen — bis zum Cutover `iuk-ue.de/m/zeichen/...`, danach zusaetzlich
 * `SUITE_HOST_ZEICHEN` an der Wurzel. `/katalog` fuehrte auf dem Suite-Host in `decideRoute` auf
 * das Portal (→ 404); die innere Form traegt beide Hosts, weil `decideRoute` sie in seinem
 * `internal`-Zweig erkennt und nach dem Segment gatet. Der Preis steht in `nav.test.ts`: nach
 * einem DIREKTEN Aufruf von `/katalog` auf dem Modul-Host fehlt die Aktivmarkierung, bis zum
 * ersten Klick in der Leiste.
 *
 * KEIN WURZEL-EINTRAG. `aktiverEintrag` (`core/shell/SuiteNav.tsx:99-107`) behandelt `href: "/"`
 * als Rueckfall und markierte ihn auf jeder nicht zugeordneten Seite. `uav` traegt diesen Fall
 * mit Browser-Messung aus, `lagerbuch` weicht ihm aus — hier wird ausgewichen.
 *
 * „MEINE ZEICHEN" TEILT SICH DAS ZEICHEN MIT „BAUKASTEN", UND ZWAR ABSICHTLICH: es ist dieselbe
 * Sache aus zwei Richtungen (bauen / das Gebaute). Ein sechster Name in `NavIkonName` haette
 * eine Unterscheidung behauptet, die es fachlich nicht gibt.
 *
 * EIN ABSCHNITT, UND ER IST ZUGLEICH DAS FILTERKRITERIUM (s. `zeichenNav`).
 */
export const ZEICHEN_NAV: SuiteNavItem[] = [
  { key: "katalog", title: "Katalog", href: "/m/zeichen/katalog", ikon: "zeichensuche" },
  { key: "merkliste", title: "Merkliste", href: "/m/zeichen/merkliste", ikon: "merkliste" },
  { key: "baukasten", title: "Baukasten", href: "/m/zeichen/baukasten", ikon: "baukasten" },
  { key: "meine", title: "Meine Zeichen", href: "/m/zeichen/meine", ikon: "baukasten" },
  { key: "lernen", title: "Üben", href: "/m/zeichen/lernen", ikon: "ueben" },
  {
    key: "lernsets",
    title: "Lernsets",
    href: "/m/zeichen/verwaltung/lernsets",
    ikon: "lernsets",
    abschnitt: "Verwaltung",
  },
];

/**
 * Die Liste, wie sie EINE bestimmte Person sieht.
 *
 * ⛔ DASSELBE PRAEDIKAT, DAS DIE ROUTE GATET (Spec §2): `canAdminModule("zeichen")` entscheidet
 * ueber den Eintrag, `moduleAdminPageOrNotFound("zeichen")` ueber die Seite. Zwei verschiedene
 * Quellen liefen auseinander, und die harmlosere Richtung — Eintrag da, Seite 404 — ist genau
 * die, die `docs/design/README.md` verbietet („fuehrt KEIN Weg dorthin, wo die aufrufende Person
 * nicht hindarf?").
 *
 * GEFILTERT WIRD UEBER `abschnitt`, NICHT UEBER DEN SCHLUESSEL: eine zweite Verwaltungsflaeche
 * ist damit von selbst mitgegatet, statt bei ihrer Einfuehrung still durchzurutschen.
 *
 * ⚠️ DIE KONSTANTE BLEIBT EXPORTIERT UND IST DIE OBERMENGE — `core/shell/navIkonen.test.tsx`
 * liest sie, weil nur sie alle fuenf neuen Zeichen enthaelt.
 */
export function zeichenNav(darfVerwalten: boolean): SuiteNavItem[] {
  if (darfVerwalten) return ZEICHEN_NAV;
  return ZEICHEN_NAV.filter((eintrag) => eintrag.abschnitt !== "Verwaltung");
}
