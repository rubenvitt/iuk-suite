/**
 * DER EINE SATZ FUER EINE ABGEWIESENE SERVER ACTION.
 *
 * Die drei Schreibpfade des Moduls (`merkeZeichen`, `entferneZeichen`,
 * `speichereEigenesZeichen`) WERFEN, wenn keine Sitzung dahintersteht — richtig,
 * denn eine Action, die unerlaubt aufgerufen wird, darf nicht „nichts tun und
 * aussehen wie Erfolg". Auf der Oberflaeche kommt dieser Wurf als abgelehntes
 * Promise an, und ohne `catch` nimmt er die ganze Flaeche mit: die Insel
 * verschwindet, der Katalog ist weg, und der Anwender sieht die Fehlerhuelle
 * statt eines Satzes.
 *
 * ⛔ DER TEXT UNTERSCHEIDET DIE URSACHEN NICHT, UND DAS IST ABSICHT. Next ersetzt
 * die Meldung einer serverseitig geworfenen Ausnahme in der Produktion durch einen
 * Digest — `fehler.message === "Forbidden"` traegt also nur in der Entwicklung.
 * Eine Fallunterscheidung darauf waere eine Auskunft, die im Betrieb nie
 * eintritt; besser ein Satz, der in beiden Faellen stimmt und den naechsten
 * Schritt nennt.
 *
 * KEIN "use client": die Konstante wird von Client-Inseln gelesen, und ein Wert
 * aus einem als Client markierten Modul kaeme in einer Server Component nicht an
 * (Falle 6). Sie liegt in `_lib/`, damit beide Richtungen offenstehen.
 */
export const AKTION_FEHLGESCHLAGEN =
  "Das hat gerade nicht geklappt. Vielleicht ist deine Anmeldung abgelaufen — " +
  "lade die Seite neu und versuch es noch einmal.";
