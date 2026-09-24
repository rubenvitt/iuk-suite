/**
 * DIE LÄNGE EINES NAMENS — begrenzt beim SCHREIBEN, nicht bei der Anzeige (DRK-402).
 *
 * Gilt für die Titel, die eine Liste der Suite ordnen: Aufgaben im UAV-Katalog,
 * Freigaben in `files`, Aufgaben und Routinen in `aufgaben`.
 *
 * ⚠️ DIE TITELSPALTE BEKOMMT KEINEN `Zellentext`. DRK-372 deckelt Freitext in
 * der Tabelle auf eine Lesebreite (`core/tabelle/Zellentext.tsx`), und die Frage
 * lag nahe, ob ein Titel mitgeht. Nein, aus zwei Gründen:
 *
 *   - Die Titelspalte ist die, an der man sich orientiert: sortiert, gesucht,
 *     oft mit dem Link auf die Detailseite. Eine umbrechende Namensspalte liest
 *     sich schlechter als eine breite, und zwar bei JEDEM Namen, nicht nur beim
 *     einen zu langen.
 *   - Ein zu langer Name ist kein Problem nur der Tabelle. Derselbe Titel steht
 *     auf der öffentlichen Freigabeseite, im ZIP-Namen, im Wochenplan, in der
 *     Teilnehmeransicht. Ein Deckel an der Anzeige repariert eine dieser Stellen.
 *
 * Bei einem Kommentar wäre die Grenze beim Schreiben falsch — er ist ein
 * Nachweis, den man nicht beschneiden darf. Ein Name ist keiner.
 *
 * WARUM 80: der längste Titel der Demodaten hat 50 Zeichen, 80 lässt Luft für
 * echte Namen und ist sichtbar kein Absatz. Bei 14px Schrift ist die Spalte damit
 * höchstens gut 600px breit — ungedeckelt, aber nach oben begrenzt. Dieselbe Zahl
 * trägt der Name eines QR-Presets (`qr/admin/preset-form.tsx`, Feld `label`).
 *
 * ⚠️ ZWEI STELLEN, BEIDE PFLICHT: `maxLength` am Feld (die Grenze, die keine
 * Fehlermeldung erzeugen muss) und die Prüfung im Server, der sich auf das Feld
 * nicht verlassen darf. Ein schon gespeicherter längerer Titel wird NIE still
 * gekürzt: `maxLength` schneidet einen vorbelegten Wert nicht ab, und der Server
 * lehnt ihn beim nächsten Speichern mit einer Meldung ab — gekürzt wird von Hand.
 *
 * Gezählt wird wie `maxLength` im Browser, in UTF-16-Einheiten (`.length`), damit
 * Feld und Server nie verschieden zählen.
 */
export const TITEL_MAX_LAENGE = 80;

/** Für einen schon getrimmten Titel. */
export function titelZuLang(titel: string): boolean {
  return titel.length > TITEL_MAX_LAENGE;
}
