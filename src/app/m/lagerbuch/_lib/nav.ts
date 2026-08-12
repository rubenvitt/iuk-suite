import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Verwaltung. Dieser Wert wird von einer Server
 * Component gelesen und liegt deshalb bewusst in `_lib/` ohne "use client".
 * Die hrefs tragen die aeuszere Pfadform, damit `aktiverEintrag` sie sowohl
 * gegen aeuszere als auch gegen umgeschriebene Pfade per Suffix aufloesen kann.
 *
 * Es gibt absichtlich keinen `/`-Eintrag: Der Wurzel-Fallback wuerde sonst auf
 * nicht zugeordneten Detailseiten eine falsche aktive Navigation anzeigen.
 */
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall" },
  { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen" },
  { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz" },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal" },
  { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens" },
  { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten" },
  { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import" },
];
