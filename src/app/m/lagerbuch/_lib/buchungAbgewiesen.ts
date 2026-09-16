/**
 * DER SENTINEL FUER DIE FACHLICHEN WUERFE DER BUCHUNGSWEGE — DRK-193.
 *
 * ⚠️ DAS PROBLEM WAR NIE, DASS `e.message` ANGEZEIGT WIRD. Es wird bewusst
 * angezeigt: unter den Transaktionen der drei Verwaltungs-Buchungen liegen
 * PRUEFUNGEN, die werfen MUESSEN, weil nur ein Wurf die Transaktion
 * zurueckrollt (§7.3, Riegelfall), und was sie werfen, sind fertige deutsche
 * Saetze — „Charge gehoert nicht zu diesem Artikel", „Ziel ist kein gueltiges,
 * aktives Fahrzeug". Der `catch` der Action ist der vorgesehene Weg, sie zur
 * Meldung zu machen. Wer das Ternaer ersatzlos durch einen festen Satz
 * ersetzt, macht vier bestehende Tests rot und nimmt der Verwaltenden die
 * einzige Auskunft, die ihr den naechsten Griff sagt.
 *
 * DAS PROBLEM WAR, DASS DERSELBE `catch` NICHT UNTERSCHEIDEN KONNTE. `e
 * instanceof Error` ist ein SQLite-Fehler ebenso wie ein eigener Wurf; ein
 * „FOREIGN KEY constraint failed" oder ein „database is locked" nahm damit
 * denselben Weg auf den Schirm wie der fachliche Satz. Treibertext auf einer
 * Arbeitsflaeche sagt niemandem etwas und nennt nebenbei Innereien.
 *
 * ⚠️ DIE UNTERSCHEIDUNG MUSS AM TYP HAENGEN, NICHT AM TEXT. Eine Liste
 * bekannter Saetze im `catch` waere dieselbe Zusage mit einer zweiten Stelle,
 * die sie vergessen kann — und sie faellt STILL: ein umformulierter Satz
 * verschwindet dann einfach hinter dem Rueckfall, und kein Tor meldet es.
 *
 * DIE BAUFORM IST NICHT NEU IN DIESEM MODUL: `_actions/inventur.ts` trennt
 * seit DRK-299 mit `InventurAbgewiesen` genau so. Die beiden bleiben
 * getrennte Klassen, weil sie getrennte Rueckfallsaetze haben („Inventur
 * konnte nicht gebucht werden." gegen die drei Vorgangssaetze hier); eine
 * gemeinsame Oberklasse haette heute keinen zweiten Leser.
 *
 * KEIN "use client" (Falle 6) und kein "use server": die Datei wird von
 * Server Actions UND von `_lib/schreibpfade/zugang.ts` gelesen. Unter
 * `"use server"` waere ein exportierter Wert eine Action, unter `"use client"`
 * kaeme die Klasse in der RSC-Ebene als Client-Referenz an — und `instanceof`
 * gegen eine Client-Referenz ist immer falsch, still.
 */

/**
 * Fachliche Abweisung INNERHALB einer Buchungs-Transaktion — sie rollt alles
 * zurueck, und ihre `message` ist der Satz, den die Verwaltende liest.
 *
 * ⚠️ DIE `message` IST OBERFLAECHENTEXT. Wer hier wirft, schreibt einen
 * vollstaendigen deutschen Satz ohne Feldnamen, ohne Id und ohne Tabellennamen
 * — er steht so im Formular. Alles, was das nicht erfuellt, gehoert in ein
 * gewoehnliches `Error` und damit hinter den Rueckfall.
 */
export class BuchungAbgewiesen extends Error {}
