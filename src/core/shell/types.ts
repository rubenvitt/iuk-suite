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
  | "uebersicht" | "artikel" | "verfall" | "fahrzeuge" | "vorlagen"
  | "checks" | "bz" | "sauerstoff" | "geraete" | "bestellung"
  | "inventur" | "journal" | "tokens" | "etiketten" | "import";

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
