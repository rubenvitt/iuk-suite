/**
 * Das Thema eines Abends oder sein Rückfall.
 *
 * WARUM DAS EINE FUNKTION IST: `evening.topic ?? "…"` fängt nur `null` — nicht
 * den LEEREN String. Der Admin-Pfad normalisiert leere Eingaben zu `null`, der
 * Import der Alt-Anwendung tut das nicht. Auf dem Abendzettel wurde daraus eine
 * leere `<h1>`: die Überschrift der Seite, die den Abend benennen soll. Dieselbe
 * Klasse steckte in zwei Admin-Seiten, wo "(ohne Thema)" ausblieb.
 *
 * Geprüft wird der GETRIMMTE Wert, angezeigt der ursprüngliche: ein Thema mit
 * Leerzeichen am Rand ist ein Thema, und es ist nicht die Aufgabe der Anzeige,
 * die Eingabe der Gruppenleitung stillschweigend zu korrigieren.
 */
export function thema(topic: string | null | undefined, rueckfall: string): string {
  if (topic === null || topic === undefined || topic.trim() === "") return rueckfall;
  return topic;
}
