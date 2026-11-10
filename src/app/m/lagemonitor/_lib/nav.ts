import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation (IDA-396): „Meldungen" ist die Tagesaufgabe und Startseite, „Einrichtung" das Seltene.
 * Kein `"use client"`: `(verwaltung)/layout.tsx` ist eine Server Component und liest diesen Wert (Falle 6).
 * Pfade in der äußeren Form, das Modul hängt unter seinem Host an der Wurzel.
 */
export const LAGEMONITOR_NAV: SuiteNavItem[] = [
  { key: "meldungen", title: "Meldungen", href: "/", ikon: "neuigkeiten", stichworte: ["Meldung anlegen", "Band"] },
  { key: "einrichtung", title: "Einrichtung", href: "/einrichtung", ikon: "einstellungen", stichworte: ["Einstellungen", "Monitore", "Zugänge", "Kategorien", "Fahrzeuge", "Lagekarte"] },
];
