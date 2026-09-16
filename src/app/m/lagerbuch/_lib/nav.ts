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
 *
 * ⚠️ DREI EINTRÄGE ZEIGEN NICHT AUF `/verwaltung/…`: „Entnahme" und „Check
 * durchführen" führen in den Helfer-Ast (DRK-305), „Auffüllen" auf eine eigene
 * Fläche im selben Stil (DRK-313). `aktiverEintrag` löst sie per Suffix genauso
 * auf wie die übrigen; sichtbar markiert wird dort ohnehin nichts, weil keine
 * der drei Flächen diese Navigation rendert.
 */
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },

  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall", abschnitt: "Bestand" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur", abschnitt: "Bestand" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung", abschnitt: "Bestand" },
  { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", ikon: "lagerorte", abschnitt: "Bestand" },
  // DRK-305, zweite Hälfte: dieselbe Entnahmefläche, die am Regal hängt — Schrank
  // → Fahrzeug und Schrank → Verbrauch, ohne Kärtchen. Siehe den Block bei
  // „Check durchführen".
  { key: "entnahme", title: "Entnahme", href: "/helfer", ikon: "entnahme", abschnitt: "Bestand" },
  /*
   * DRK-313 — DER EINZIGE WEG IN DIE AUFFUELLANSICHT, und das ist Absicht.
   *
   * Sie liegt NICHT im Helfer-Ast und bekommt deshalb auch keinen dritten Tab
   * in dessen Leiste (Begruendung ausgeschrieben in `_ui/AuffuellRahmen.tsx`):
   * mit einem Kaertchen fuellt niemand auf, und ein Tab, der fuer die meisten
   * Sitzungen mit 404 antwortet, ist keine Navigation.
   *
   * ⚠️ ER STEHT DIREKT UNTER „Entnahme", weil beide dieselbe Flaeche in
   * entgegengesetzter Richtung sind — Material heraus, Material hinein. Wer
   * sie trennt, laesst jemanden die falsche suchen. Der Rueckweg steht im Kopf
   * des Rahmens draussen („Zur Verwaltung"); ohne ihn waere der Klick eine
   * Sackgasse.
   */
  { key: "auffuellen", title: "Auffüllen", href: "/auffuellen", ikon: "auffuellen", abschnitt: "Bestand" },
  /**
   * DRK-314 — die Kiste in der Halle.
   *
   * ⚠️ SIE STEHT IM ABSCHNITT „Bestand" UND NICHT BEI „Einheiten & Geräte", und
   * das ist eine Aussage: die Box ist ein LAGERORT, kein Träger. Wer sie unter
   * die Einheiten stellte, legte nahe, dass sie ein Soll hat und gecheckt wird
   * — genau die vier Folgen, die Migration 0011 mit `typ = 'lager'` ausschließt.
   *
   * ⚠️ UND SIE FÜHRT IN DIE VERWALTUNG, nicht in den Helfer-Ast — anders als
   * „Entnahme" und „Check durchführen" eine Zeile darüber und darunter. Der
   * Grund ist der Leser: wer in der Verwaltung ist, will wissen, WAS in der
   * Kiste liegt und woher es kam; das Ablegen selbst passiert am Fahrzeug, auf
   * `/helfer/box`, und die Seite verlinkt es.
   */
  { key: "entnahmebox", title: "Entnahmebox", href: "/verwaltung/entnahmebox", ikon: "entnahmebox", abschnitt: "Bestand" },

  /* DRK-309: Die Beschriftung nennt beide Arten, der `href` bleibt — wer eine
   * Tasche sucht, findet unter „Fahrzeuge" nichts und schliesst, es gebe den
   * Ort nicht. `key` und Pfad sind dagegen Adressen (aktiver Eintrag,
   * Zugangs-Codes, gedruckte Kärtchen) und bleiben unangetastet.
   *
   * ⚠️ UND DIE ABSCHNITTSUEBERSCHRIFT MIT, sonst steht „Fahrzeuge & Taschen"
   * unter „Fahrzeuge & Geräte" (Reviewrunde 13). `abschnitt` wird SICHTBAR
   * gerendert — in der Leiste ab 768px und in der Schublade darunter —, und
   * wer Ueberschriften ueberfliegt statt Eintraege, liest dort weiter, es
   * gehe nur um Fahrzeuge. Neutral ist hier richtig, weil die Ueberschrift
   * ueber VIER Eintraege spricht (Einheiten, Vorlagen, Geräte, Sauerstoff)
   * und damit ueber mehr als eine Art — dieselbe Regel wie ueberall sonst in
   * diesem Ticket. „Einheiten" ist dabei kein neues Wort: die Oberfläche sagt
   * es bereits an „Verknüpfte Einheiten" und „Einheit wählen". */
  { key: "fahrzeuge", title: "Fahrzeuge & Taschen", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge", abschnitt: "Einheiten & Geräte" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen", abschnitt: "Einheiten & Geräte" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete", abschnitt: "Einheiten & Geräte" },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff", abschnitt: "Einheiten & Geräte" },

  { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks", abschnitt: "Prüfungen" },
  /*
   * DER EINSTIEG IN DEN HELFER-AST — DRK-305, und die beiden einzigen Einträge,
   * die aus dem Verwaltungsrahmen HERAUSFÜHREN.
   *
   * Das ist kein Versehen: die Check- und die Entnahmefläche sind für eine Hand
   * am Telefon gebaut, mit 56/72px-Bedienhöhen und ohne Seitenleiste. Sie in den
   * Rahmen zu holen hieße, sie zweimal zu bauen — und die zweite Fassung
   * bekommt die nächste Änderung nicht mit.
   *
   * Der Weg zurück steht im Kopf des Rahmens draußen („Zur Verwaltung",
   * `_ui/HelferRahmen.tsx`); ohne ihn wäre der Klick eine Sackgasse.
   *
   * ⚠️ `/helfer/check` OHNE `?fz=`: die Seite bietet dann die volle Fahrzeugwahl
   * an. Mit einer Id wäre der Eintrag ein Lesezeichen auf ein einzelnes Fahrzeug
   * — genau die Beschränkung, gegen die das Ticket geschrieben ist.
   */
  { key: "pruefen", title: "Check durchführen", href: "/helfer/check", ikon: "pruefen", abschnitt: "Prüfungen" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz", abschnitt: "Prüfungen" },

  { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal", abschnitt: "Protokoll" },

  { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten", abschnitt: "Einrichtung" },
  /* DRK-312 — die QR-Karte je Handlager bzw. Einheit. Sie steht NEBEN
   * „Etiketten" und nicht darin: die beiden Flächen drucken auf verschiedenes
   * Material (gekaufte Klebeetiketten gegen ein Blatt je Ort) und in
   * verschiedenen Seitengrößen, und zusammen in einem Dokument verwirft
   * Chromium die Seitengröße für beide.
   *
   * ⚠️ EIN EIGENES ZEICHEN, kein geteiltes mit „Etiketten". Die Regel steht in
   * `core/shell/types.ts` ausgeschrieben und ist an `checks`/`pruefen` schon
   * einmal angewandt worden: zwei Einträge im SELBEN Abschnitt mit demselben
   * Zeichen sind in der Seitenleiste nicht auseinanderzuhalten. Die Bauform
   * von `baukasten` (zwei Einträge, ein Zeichen) trägt nur, solange die
   * Einträge in verschiedenen Abschnitten stehen. */
  { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", ikon: "ortsetiketten", abschnitt: "Einrichtung" },
  { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens", abschnitt: "Einrichtung" },
  { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import", abschnitt: "Einrichtung" },
];
