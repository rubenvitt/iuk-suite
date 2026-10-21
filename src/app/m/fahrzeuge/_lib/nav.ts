import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation. Kein `"use client"`: `(verwaltung)/layout.tsx` ist eine Server Component und
 * liest diesen Wert (Falle 6). Pfade in der äußeren Form, das Modul hängt unter seinem Host an der Wurzel.
 */
export const FAHRZEUGE_NAV: SuiteNavItem[] = [
  { key: "liste", title: "Fahrzeuge", href: "/", ikon: "fahrzeuge" },
  { key: "erstimport", title: "Erstimport", href: "/erstimport", ikon: "import" },
];
