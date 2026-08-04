/**
 * Die EINE Faltung, die beide Haelften der Journalsuche benutzen — §5.13.2.
 *
 * KEIN "use client".
 *
 * Die JS-Haelfte (Artikelname) filtert damit im Speicher; die SQL-Haelfte
 * (buchungen.kommentar) ruft dieselbe Funktion als benutzerdefinierte
 * SQLite-Funktion `lb_falte`, registriert im modul-eigenen Opener `_db/client.ts`.
 * Genau daran haengt, dass lagerbuch NICHT `getModuleDb` benutzt.
 *
 * WARUM ZUR ABFRAGEZEIT UND NICHT GESPEICHERT: eine normalisierte Spalte braeuchte
 * einen Backfill, und Backfill heisst `UPDATE buchungen` — das bricht am
 * Append-only-Trigger ab. Eine generierte Spalte scheidet aus, weil SQLite darin
 * keine benutzerdefinierten Funktionen zulaesst und das eingebaute `lower()`
 * ebenfalls nur ASCII faltet.
 *
 * ß/ss wird bewusst NICHT geheilt: das ist eine gemeinsame Luecke beider Haelften,
 * keine Divergenz zwischen ihnen.
 */
export const falte = (s: string): string => s.toLowerCase();
