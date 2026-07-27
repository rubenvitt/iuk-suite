/**
 * Die Datenformen der Suite-Kopfzeile. Eigene Datei, weil `switcherEntries.ts`
 * (Server) und `SuiteNav.tsx` (Client) beide darauf zugreifen — laege der Typ
 * in der Client-Komponente, zoege der Server-Import sie mit ins Bundle.
 */

/** Ein Modul im App-Wechsler. `icon` ist ein @ant-design/icons Komponentenname. */
export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

/**
 * Ein Eintrag der modul-internen Navigation. Module uebergeben das optional an
 * `Shell`; wer nichts uebergibt, bekommt genau das Bild von vorher.
 *
 * Bewusst OHNE `icon`: die Modulnavigation steht in einer Zeile bzw. Liste mit
 * Text, und ein Icon je Unterseite waere Zierrat, den niemand pflegt.
 */
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
}
