/**
 * Die Datenformen der Suite-Kopfzeile. Eigene Datei, weil `launcherEintraege.ts`
 * (Server) und `SuiteNav.tsx` (Client) beide darauf zugreifen — laege der Typ
 * in der Client-Komponente, zoege der Server-Import sie mit ins Bundle.
 */

/**
 * Schluessel eines Navigationszeichens. STRING-UNION, keine Ableitung aus der
 * Komponentenmap (`navIkonen.tsx`) — diese Datei wird von Server Components
 * gelesen (`m/lagerbuch/_lib/nav.ts`), und ein Wert-Import aus einem
 * "use client"-Modul kaeme dort als Client-Referenz an: Falle 6, HTTP 500 fuer
 * jede Seite mit Navigation, unsichtbar fuer typecheck, build und Vitest.
 * `navIkonen.test.tsx` haelt diese Datei quelltextlich frei von jedem
 * Zeichen-Paket-Import (das Paket, das `navIkonen.tsx` fuer die Komponenten
 * nutzt, steht absichtlich nicht einmal namentlich in diesem Kommentar).
 */
export type NavIkonName =
  | "uebersicht" | "artikel" | "verfall" | "fahrzeuge" | "vorlagen" | "checks"
  | "bz" | "sauerstoff" | "geraete" | "bestellung" | "inventur" | "journal"
  | "tokens" | "etiketten" | "import" | "ausleihen" | "update" | "versionen"
  // Drei Zeichen fuer die Verwaltung des Moduls `uav` (Drohnentraining). Keiner der
  // achtzehn Namen darueber traegt die Sache: es gibt keinen fuer Personen, keinen fuer
  // einen Uebungskatalog und keinen fuer die Trainingsansicht selbst. Ein geliehener
  // Name waere schlimmer als ein neuer — `versionen` (PiListNumbers) sieht einem
  // Aufgabenkatalog aehnlich und hiesse an dieser Stelle etwas anderes, und der naechste
  // Leser haette einen falschen Begriff statt eines fehlenden. Dieselbe Begruendung und
  // dasselbe Vorgehen wie bei den drei Zeichen, die `radio` mitgebracht hat.
  | "teilnehmer" | "katalog" | "training"
  // DRK-297: die Schraenke des Handlagers. KEIN geliehener Name — `artikel`
  // (PiPackage) meint das Material, nicht den Ort, an dem es liegt, und
  // `fahrzeuge` ist der andere Lagerorttyp. Dieselbe Begruendung wie bei den
  // Zeichen, die `radio` und `uav` mitgebracht haben.
  | "lagerorte"
  // DRK-305: der Weg in die Entnahmeflaeche des Helfer-Asts. KEIN geliehener
  // Name — `artikel` (PiPackage) meint das Material, `lagerorte` (PiLockers) den
  // Ort, an dem es liegt; keiner von beiden traegt die HANDLUNG, Material
  // herauszunehmen. `ausleihen` (PiArrowsLeftRight) heisst in `radio` etwas
  // anderes und gaebe dem naechsten Leser einen falschen Begriff.
  //
  // `pruefen` ist die HANDLUNG, `checks` (PiCheckSquare) die Historie der
  // abgeschlossenen Pruefungen — zwei Nav-Eintraege im selben Abschnitt, und ein
  // geteiltes Zeichen machte sie in der Seitenleiste ununterscheidbar. Die
  // Bauform von `baukasten` (zwei Eintraege, ein Zeichen) traegt hier NICHT:
  // dort stehen die beiden Eintraege in verschiedenen Abschnitten.
  // DRK-313: das Auffuellen des Handlagers. Es steht direkt UNTER „Entnahme"
  // in derselben Seitenleiste und ist die Gegenrichtung — genau deshalb KEIN
  // geteiltes Zeichen: zwei benachbarte Eintraege mit demselben Bild sind in
  // der Leiste nicht zu unterscheiden, und hier entschiede das darueber, ob
  // Material ins Lager kommt oder es verlaesst. `PiHandArrowUp` ist die
  // Spiegelung von `entnahme` (`PiHandArrowDown`) und traegt die Richtung als
  // Bild.
  | "entnahme" | "auffuellen" | "pruefen"
  // DRK-312: das A7-Etikett je Handlager bzw. Einheit. KEIN geliehener Name,
  // und der Grund steht zwei Absaetze weiter oben schon ausgeschrieben:
  // `etiketten` (PiQrCode) traegt den Nav-Eintrag daneben, und die beiden
  // stehen im SELBEN Abschnitt („Einrichtung") — ein geteiltes Zeichen machte
  // sie in der Seitenleiste ununterscheidbar. Die Bauform von `baukasten`
  // (zwei Eintraege, ein Zeichen) traegt hier also genauso wenig wie bei
  // `checks`/`pruefen`. PiMapPinArea meint den ORT, den das Etikett benennt —
  // `lagerorte` (PiLockers) meint die Schraenke darin und waere eine andere
  // Aussage.
  | "ortsetiketten"
  // DRK-314: die Entnahmebox — die Kiste, in die Helfende legen, was sie von
  // einer Einheit heruntergenommen haben. KEIN geliehener Name: `lagerorte`
  // (PiLockers) meint die Schraenke des Handlagers, und die Box haengt
  // ausdruecklich NEBEN dem Handlager, nicht darin; `artikel` (PiPackage) meint
  // das Material, nicht den Ort; `entnahme` (PiHandArrowDown) ist die
  // Gegenrichtung — Material aus dem Regal nehmen. Die beiden stuenden
  // ueberdies im selben Modul, und ein geteiltes Zeichen machte sie in der
  // Seitenleiste ununterscheidbar.
  | "entnahmebox"
  // DRK-471: die Verwaltung des Einsatzbuchs. KEIN geliehener Name — `fahrzeuge`
  // (PiTruck) meint im lagerbuch einen Lagerort, und die Stammdaten tragen neben
  // Fahrzeugen auch Personal und Alarmstichworte; `update` (PiArrowsClockwise)
  // heißt in radio die Gerätesoftware. Ein geliehener Name gäbe dem nächsten
  // Leser einen falschen Begriff statt eines fehlenden.
  | "stammdaten" | "einstellungen"
  // DRK-471 (Stufe 3): der Reader, der eine Exportdatei im Browser öffnet. KEIN
  // geliehener Name — `import` (PiUploadSimple) hieße „hochladen“, und genau das tut
  // der Reader nicht; `journal` (PiClockCounterClockwise) meint eine Historie. Das
  // offene Buch mit Text trägt das Lesen.
  | "reader"
  // DRK-471 (Stufe 5): die Verwaltung des Einsatzbuch-Rechners (Widerruf, Test-Rechner,
  // Schlüsselfreigaben). KEIN geliehener Name — `stammdaten` (PiAddressBook) meint Fahrzeuge,
  // Personal und Stichworte, `einstellungen` (PiGearSix) die Fristen der Suite; keiner der
  // beiden trägt das physische Gerät, um das es hier geht. Ein geliehener Name gäbe dem
  // nächsten Leser einen falschen Begriff statt eines fehlenden.
  | "rechner";

/**
 * Ein Eintrag der EINEN Einstiegsliste — Suite-Modul oder externer Dienst.
 * Beide Icon-Felder sind optional; der Umschalter fällt in dieser Reihenfolge
 * zurück: `iconUrl` → `ICONS[icon]` → neutrales Link-Icon. Ein Union-Typ zwänge
 * jede Aufrufstelle zu einer Fallunterscheidung, die genau diesen Rückfall
 * nachbaut.
 */
export interface LauncherEintrag {
  /** Eindeutig über beide Quellen: Module tragen ihren Registry-Key, Dienste `dienst:<id>`. */
  key: string;
  title: string;
  beschreibung?: string;
  /** Schlüssel der ICONS-Map — nur Suite-Module. Auflösung NUR in Client-Inseln. */
  icon?: string;
  /** Bild-URL — nur externe Dienste. */
  iconUrl?: string | null;
  href: string;
  abschnitt: string;
  /** Öffnet in neuem Tab (`services.openInNewTab`). */
  extern: boolean;
}

/**
 * Ein Eintrag der modul-internen Navigation. Module uebergeben das optional an
 * `Shell`; wer nichts uebergibt, bekommt genau das Bild von vorher.
 */
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
  /** Optional. Aufgeloest in SuiteNav — hier steht NIE eine Komponente. */
  ikon?: NavIkonName;
  /**
   * Überschrift, unter der dieser Eintrag steht. FEHLT SIE ÜBERALL, bleibt es
   * die Zeile von heute — Portal, Feedback und Dateien ändern sich damit um
   * null Zeilen.
   *
   * Ein OPTIONALES FELD und bewusst keine verschachtelte Struktur
   * (`{ titel, items[] }`): die hätte `aktiverEintrag` flach machen lassen, was
   * der Aufrufer schachtelt, dem Drawer einen zweiten Zweig gegeben und die
   * Quelltext-Zusicherung in `lagerbuch/_ui/VerwaltungsRahmen.test.tsx:303`
   * gebrochen (`typ: "SuiteNavItem[]"`). So bleibt die Liste flach und
   * Gruppierung reine Darstellung.
   */
  abschnitt?: string;
}
