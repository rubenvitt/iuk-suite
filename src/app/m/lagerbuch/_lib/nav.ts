import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Verwaltung. Dieser Wert wird von einer Server
 * Component gelesen und liegt deshalb bewusst in `_lib/` ohne "use client".
 * Die hrefs tragen die äußere Pfadform, damit `aktiverEintrag` sie sowohl
 * gegen äußere als auch gegen umgeschriebene Pfade per Pfadanfang auflösen kann.
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
 * Fläche im selben Stil (DRK-313). `aktiverEintrag` löst sie per Pfadanfang genauso
 * auf wie die übrigen; sichtbar markiert wird dort ohnehin nichts, weil keine
 * der drei Flächen diese Navigation rendert.
 *
 * ⚠️ SEIT IDA-380 STEHEN DIE DREI ZUSAMMEN, als eigener Abschnitt „Am Regal /
 * am Fahrzeug" direkt unter „Übersicht". Vorher hingen sie verteilt unter
 * „Bestand" und „Prüfungen", und mit 23 Einträgen lag „Check durchführen" bei
 * 1280×720 unter der Kante. Es sind die drei HANDLUNGEN der Liste — alles
 * darunter sind Listen und Auswertungen —, und sie haben eines gemeinsam, das
 * kein anderer Eintrag hat: sie führen aus dem Verwaltungsrahmen heraus.
 *
 * `stichworte` (IDA-380): Wörter, unter denen „Springen zu" einen Eintrag
 * AUCH findet — die Wörter, die jemand sucht, bevor er unsere Beschriftung
 * kennt („Wareneingang" → Auffüllen, „Aussondern" → Verfall). Sichtbar wird
 * davon nichts; die Beschriftung bleibt die eine.
 */
/** Der Abschnitt der drei Handlungen (IDA-380) — eine Konstante, weil drei Einträge ihn tragen. */
const AM_REGAL = "Am Regal / am Fahrzeug";

export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },

  /*
   * IDA-380 — DIE DREI HANDLUNGEN ZUERST, als eigener Abschnitt. Wer die
   * Verwaltung öffnet, um am Regal etwas zu buchen oder ein Fahrzeug zu
   * prüfen, findet den Weg ohne Scrollen; die Begründung steht im Kopf dieser
   * Datei.
   */
  // DRK-305, zweite Hälfte: dieselbe Entnahmefläche, die am Regal hängt — Schrank
  // → Fahrzeug und Schrank → Verbrauch, ohne Kärtchen. Siehe den Block bei
  // „Check durchführen".
  {
    key: "entnahme", title: "Entnahme", href: "/helfer", ikon: "entnahme", abschnitt: AM_REGAL,
    stichworte: ["Verbrauch", "Ausgabe", "herausnehmen"],
  },
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
   *
   * „Wareneingang" ist das Wort, unter dem die Lieferung im Lager ankommt —
   * gebucht wird sie hier (IDA-380).
   */
  {
    key: "auffuellen", title: "Auffüllen", href: "/auffuellen", ikon: "auffuellen", abschnitt: AM_REGAL,
    stichworte: ["Wareneingang", "Lieferung", "Nachschub", "einlagern", "einbuchen"],
  },
  /*
   * DER EINSTIEG IN DEN HELFER-AST — DRK-305. Mit „Auffüllen" darüber sind es
   * die drei Einträge, die aus dem Verwaltungsrahmen HERAUSFÜHREN.
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
   *
   * Bis IDA-380 stand er unter „Prüfungen", neben der Historie „Checks"; dort
   * findet ihn „Springen zu" weiterhin über das Stichwort.
   */
  {
    key: "pruefen", title: "Check durchführen", href: "/helfer/check", ikon: "pruefen", abschnitt: AM_REGAL,
    stichworte: ["Fahrzeugcheck", "prüfen", "Prüfungen"],
  },

  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel", abschnitt: "Bestand", stichworte: ["Material"] },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall", abschnitt: "Bestand", stichworte: ["aussondern", "abgelaufen", "Ablaufdatum", "MHD", "Charge"] },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur", abschnitt: "Bestand", stichworte: ["zählen", "Bestandsaufnahme"] },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung", abschnitt: "Bestand", stichworte: ["nachbestellen", "Mindestbestand", "Bestellvorschlag"] },
  { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", ikon: "lagerorte", abschnitt: "Bestand", stichworte: ["Handlager", "Schrank", "Regal"] },
  /**
   * DRK-314 — die Kiste in der Halle.
   *
   * ⚠️ SIE STEHT IM ABSCHNITT „Bestand" UND NICHT BEI „Einheiten & Geräte", und
   * das ist eine Aussage: die Box ist ein LAGERORT, kein Träger. Wer sie unter
   * die Einheiten stellte, legte nahe, dass sie ein Soll hat und gecheckt wird
   * — genau die vier Folgen, die Migration 0011 mit `typ = 'lager'` ausschließt.
   *
   * ⚠️ UND SIE FÜHRT IN DIE VERWALTUNG, nicht in den Helfer-Ast — anders als
   * „Entnahme" und „Check durchführen" im Abschnitt „Am Regal / am Fahrzeug". Der
   * Grund ist der Leser: wer in der Verwaltung ist, will wissen, WAS in der
   * Kiste liegt und woher es kam; das Ablegen selbst passiert am Fahrzeug, auf
   * `/helfer/box`, und die Seite verlinkt es.
   */
  { key: "entnahmebox", title: "Entnahmebox", href: "/verwaltung/entnahmebox", ikon: "entnahmebox", abschnitt: "Bestand", stichworte: ["Box", "Kiste"] },

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
  { key: "fahrzeuge", title: "Fahrzeuge & Taschen", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge", abschnitt: "Einheiten & Geräte", stichworte: ["Einheit", "Beladung", "Plombe"] },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen", abschnitt: "Einheiten & Geräte", stichworte: ["Soll", "Beladeliste"] },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete", abschnitt: "Einheiten & Geräte", stichworte: ["MTK", "Medizingerät", "Medizinprodukt"] },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff", abschnitt: "Einheiten & Geräte", stichworte: ["O2", "Flasche", "Fülldruck"] },

  /* IDA-298 — von Helfern nach dem Scan eines Ortsetiketts gemeldet. */
  { key: "maengel", title: "Mängel", href: "/verwaltung/maengel", ikon: "maengel", abschnitt: "Prüfungen", stichworte: ["defekt", "Schaden", "Meldung"] },
  { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks", abschnitt: "Prüfungen", stichworte: ["Fahrzeugcheck", "Prüfprotokoll"] },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz", abschnitt: "Prüfungen", stichworte: ["Blutzucker", "BZ-Gerät"] },

  { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal", abschnitt: "Protokoll", stichworte: ["Buchungen", "Verlauf"] },
  /* IDA-261 — die Verdichtung des Journals: Verbrauch, Nachschub und Verfall
   * über Monate. Sie steht UNTER dem Journal, weil sie aus genau denselben
   * Zeilen gerechnet wird; wer eine Zahl nicht glaubt, findet die Buchungen
   * einen Eintrag darüber. */
  { key: "statistik", title: "Statistik", href: "/verwaltung/statistik", ikon: "statistik", abschnitt: "Protokoll", stichworte: ["Auswertung", "Verbrauch"] },

  /* DRK-312 — die QR-Karte je Handlager bzw. Einheit.
   *
   * ⚠️ SIE STEHT SEIT DRK-406 VOR DEN ARTIKELETIKETTEN, und die Reihenfolge ist
   * eine Aussage über die Häufigkeit: hier stehen die Codes, mit denen der
   * ganze Helfer-Weg anfängt, und diese Fläche zieht fehlende Codes beim Öffnen
   * nach. Die Klebeetiketten fürs Regalfach druckt man einmal beim Einrichten
   * eines Artikels — die Ortskarten immer dann, wenn eine Einheit dazukommt
   * oder ein Code zurückgesetzt wurde.
   *
   * ⚠️ EIN EIGENES ZEICHEN, kein geteiltes mit „Artikeletiketten". Die Regel
   * steht in `core/shell/types.ts` ausgeschrieben und ist an `checks`/`pruefen`
   * schon einmal angewandt worden: zwei Einträge im SELBEN Abschnitt mit
   * demselben Zeichen sind in der Seitenleiste nicht auseinanderzuhalten. */
  { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", ikon: "ortsetiketten", abschnitt: "Einrichtung", stichworte: ["QR-Karte", "Ortskarte"] },
  /* DRK-406 — „Artikeletiketten" statt „Etiketten", und einen Platz weiter
   * unten.
   *
   * ⚠️ DER NAME IST ENGER GEWORDEN, WEIL DIE FLÄCHE ES IST: sie druckte bis
   * dahin auch Zugangs-Kärtchen, die jetzt auf den Ortskarten stehen. „Etiketten"
   * über einem Bogen, der nur noch Artikel kennt, ist die Sorte Beschriftung,
   * nach der jemand zwanzig Minuten sucht, bevor er fragt.
   *
   * ⚠️ `key` UND `href` BLEIBEN. Sie sind Adressen — der aktive Eintrag hängt am
   * `key`, der Pfad steht in Lesezeichen. Dieselbe Trennung wie bei
   * „Fahrzeuge & Taschen" (DRK-309): die Beschriftung ist das, was jemand liest,
   * `key` und Pfad sind das, worauf etwas zeigt. */
  { key: "etiketten", title: "Artikeletiketten", href: "/verwaltung/etiketten", ikon: "etiketten", abschnitt: "Einrichtung", stichworte: ["Barcode", "Aufkleber"] },
  { key: "tokens", title: "Zugangscodes", href: "/verwaltung/tokens", ikon: "tokens", abschnitt: "Einrichtung", stichworte: ["Kärtchen", "Token"] },
  { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import", abschnitt: "Einrichtung", stichworte: ["CSV", "Excel", "hochladen"] },
];
