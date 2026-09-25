import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Einsatzbuch-Verwaltung.
 *
 * Kein `"use client"`: `(verwaltung)/layout.tsx` ist eine Server Component und liest diesen
 * Wert — aus einem Client-Modul käme er dort als Client-Referenz an (Falle 6, HTTP 500 für
 * jede Seite mit Navigation). Die Pfade tragen die äußere Form (`/stammdaten`, nicht
 * `/m/einsatzbuch/stammdaten`), weil das Modul unter seinem eigenen Host an der Wurzel hängt.
 *
 * Alle Einträge hängen an `(verwaltung)/layout.tsx` (Host + Gruppe): wer die Leiste sieht,
 * darf jedes Ziel sehen. Der Reader (Stufe 3) läuft ganz im Browser, braucht aber dieselbe Hülle.
 */
export const EINSATZBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
  { key: "stammdaten", title: "Stammdaten", href: "/stammdaten", ikon: "stammdaten" },
  { key: "rechner", title: "Rechner", href: "/rechner", ikon: "rechner" },
  { key: "einstellungen", title: "Einstellungen", href: "/einstellungen", ikon: "einstellungen" },
  { key: "reader", title: "Reader", href: "/reader", ikon: "reader" },
];
