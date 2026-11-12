import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation. Kein `"use client"`: `(verwaltung)/layout.tsx` ist eine Server Component und
 * liest diesen Wert (Falle 6). Pfade in der äußeren Form, das Modul hängt unter seinem Host an der Wurzel.
 *
 * `auffang` an der Fahrzeugtafel: die Akten (`/fahrzeug/<id>`) sind ihre Detailseiten und liegen neben
 * ihr, nicht unter ihr (IDA-299).
 */
export const FAHRZEUGE_NAV: SuiteNavItem[] = [
  { key: "tafel", title: "Fahrzeugtafel", href: "/tafel", ikon: "uebersicht", auffang: true },
  { key: "liste", title: "Fahrzeuge", href: "/", ikon: "fahrzeuge" },
  { key: "erstimport", title: "Erstimport", href: "/erstimport", ikon: "import" },
];
