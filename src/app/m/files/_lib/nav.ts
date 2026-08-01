import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG — UND WARUM SIE IN `_lib/` LIEGT UND NICHT
 * NEBEN DER KOMPONENTE, DIE SIE BENUTZT.
 *
 * Zwei SERVER Components lesen diesen WERT: `(verwaltung)/layout.tsx` und der
 * Rollen-Verteiler `page.tsx` (Spec §3.5) — beide, weil der Verteiler auszerhalb
 * aller Route-Groups liegt und das Group-Layout fuer ihn nicht greift.
 *
 * Laege das Array neben einer `"use client"`-Komponente in `_ui/`, bekaeme eine
 * Server Component keine Kopie des Wertes, sondern eine CLIENT-REFERENZ:
 * `FILES_NAV.map is not a function`, HTTP 500 fuer die ganze Seite. TypeScript
 * ist dabei zufrieden, `pnpm build` findet nichts, und ein Vitest kann es
 * strukturell nicht finden — unter Vitest sind beide Module normale ES-Module
 * und `"use client"` ein wirkungsloser String (`docs/design/README.md`, Falle 6;
 * im Modul `feedback` genau so passiert, `MONATS_FENSTER`).
 *
 * Diese Datei traegt deshalb KEIN `"use client"`, und der Scan in
 * `_ui/VerwaltungsRahmen.test.tsx` haelt das fest.
 *
 * DREI EINTRAEGE, IMMER ALLE DREI. Das Modul hat genau EINE Zugriffsstufe
 * (`requireFilesAccess`), also kann kein Eintrag in ein `notFound()` fuehren —
 * die Gegenprobe aus `docs/design/README.md` („fuehrt kein Weg dorthin, wo die
 * aufrufende Person nicht hindarf?") ist hier strukturell erfuellt.
 *
 * Die Ein-Eintrag-Regel aus `portal/layout.tsx` („ohne Verwaltungsrecht gar
 * keine Navigation, statt einer Zeile mit dem einen Eintrag, der auf die Seite
 * zeigt, auf der man steht") greift hier also nie. Sie ist trotzdem benannt,
 * damit niemand spaeter „Posteingang" und „Abgabelinks" hinter ein zweites
 * Praedikat legt und dabei genau diese Ein-Eintrag-Zeile erzeugt.
 *
 * Die `href`s stehen so, wie `Modulnav` sie verlinkt — unveraendert
 * (`core/shell/SuiteNav.tsx:136-150`). Das passt, weil ein Modul der Suite unter
 * seinem eigenen Host an der Wurzel haengt; dieselbe Form wie in
 * `feedback/(admin)/layout.tsx` und `portal/layout.tsx`.
 */
export const FILES_NAV: SuiteNavItem[] = [
  { key: "start", title: "Freigaben", href: "/" },
  { key: "posteingang", title: "Posteingang", href: "/posteingang" },
  { key: "zugangslinks", title: "Abgabelinks", href: "/zugangslinks" },
];
