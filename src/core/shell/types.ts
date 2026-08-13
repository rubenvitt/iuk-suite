/**
 * Die Datenformen der Suite-Kopfzeile. Eigene Datei, weil `switcherEntries.ts`
 * (Server) und `SuiteNav.tsx` (Client) beide darauf zugreifen — laege der Typ
 * in der Client-Komponente, zoege der Server-Import sie mit ins Bundle.
 */

/** Ein Modul im App-Wechsler. `icon` ist ein Ant-Design-Icons-Komponentenname. */
export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

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
 * Ein Eintrag der modul-internen Navigation. Module uebergeben das optional an
 * `Shell`; wer nichts uebergibt, bekommt genau das Bild von vorher.
 */
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
  /** Optional. Aufgeloest in SuiteNav — hier steht NIE eine Komponente. */
  ikon?: NavIkonName;
}
