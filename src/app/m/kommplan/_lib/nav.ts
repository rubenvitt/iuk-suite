import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Kommunikationspläne. Bis Haarlinie Etappe 3 standen Bibliothek,
 * Einstellungen und Archiv als Links im Seitenkopf der Planliste — als einziges Modul nicht im Menü.
 *
 * Kein `"use client"`: `_ui/Huelle.tsx` ist eine Server Component und liest diesen Wert (Falle 6).
 * Die Pfade tragen die äußere Form (`/archiv`, nicht `/m/kommplan/archiv`), weil das Modul unter
 * seinem eigenen Host an der Wurzel hängt.
 *
 * `admin` ist `darfKommplanBearbeiten` — dasselbe Prädikat, das `(verwaltung)/layout.tsx` und die
 * Seiten Bibliothek und Einstellungen gaten: kein Eintrag zeigt auf eine Seite, die für die
 * klickende Person 404 ist.
 */
export function kommplanNav(admin: boolean): SuiteNavItem[] {
  const eintraege: SuiteNavItem[] = [
    { key: "plaene", title: "Pläne", href: "/", ikon: "plaene", auffang: true },
    { key: "archiv", title: "Archiv", href: "/archiv", ikon: "archiv" },
  ];
  if (admin) {
    eintraege.push(
      { key: "bibliothek", title: "Bibliothek", href: "/bibliothek", ikon: "bibliothek" },
      { key: "einstellungen", title: "Einstellungen", href: "/einstellungen", ikon: "einstellungen" },
    );
  }
  return eintraege;
}
