import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Verwaltung. Dieser Wert wird von einer Server
 * Component gelesen und liegt deshalb bewusst in `_lib/` ohne "use client".
 * Die hrefs tragen die äußere Pfadform, damit `aktiverEintrag` sie sowohl
 * gegen äußere als auch gegen umgeschriebene Pfade per Suffix auflösen kann.
 *
 * Es gibt absichtlich keinen `/`-Eintrag: Der Wurzel-Fallback würde sonst auf
 * nicht zugeordneten Detailseiten eine falsche aktive Navigation anzeigen.
 *
 * ABSCHNITTE, UND DAMIT EINE SEITENLEISTE STATT EINER ZEILE. Fünfzehn
 * gleichrangige Einträge brachen in der zweiten Kopfzeile um; „BZ-Kontrolle"
 * stand zweizeilig mitten in der Reihe. Das Feld ist optional — Portal,
 * Feedback und Dateien vergeben es nicht und behalten ihre Zeile
 * (`core/shell/navAbschnitte.ts`).
 *
 * „Übersicht" trägt bewusst KEINEN Abschnitt und steht damit vor der ersten
 * Überschrift.
 */
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },

  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall", abschnitt: "Bestand" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur", abschnitt: "Bestand" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung", abschnitt: "Bestand" },

  { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge", abschnitt: "Fahrzeuge & Geräte" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen", abschnitt: "Fahrzeuge & Geräte" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete", abschnitt: "Fahrzeuge & Geräte" },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff", abschnitt: "Fahrzeuge & Geräte" },

  { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks", abschnitt: "Prüfungen" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz", abschnitt: "Prüfungen" },

  { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal", abschnitt: "Protokoll" },

  { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten", abschnitt: "Einrichtung" },
  { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens", abschnitt: "Einrichtung" },
  { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import", abschnitt: "Einrichtung" },
];
