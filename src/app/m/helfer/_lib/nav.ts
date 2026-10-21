import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation. Kein `"use client"`: `(verwaltung)/layout.tsx` ist eine Server Component und
 * liest diesen Wert (Falle 6). Pfade in der äußeren Form, das Modul hängt unter seinem Host an der
 * Wurzel.
 *
 * Alle Einträge hängen am selben Riegel (Zugangsgruppe). „Abgleich“ und „Einstellungen“ sehen auch
 * Personen ohne Admin-Recht, dann nur lesend — dasselbe Prädikat (`darfHelferVerwalten`) entscheidet
 * dort über jeden Knopf und jede Action.
 */
export const HELFER_NAV: SuiteNavItem[] = [
  { key: "liste", title: "Helfer", href: "/", ikon: "teilnehmer" },
  { key: "abgleich", title: "Abgleich", href: "/abgleich", ikon: "import" },
  { key: "einstellungen", title: "Einstellungen", href: "/einstellungen", ikon: "einstellungen" },
];
