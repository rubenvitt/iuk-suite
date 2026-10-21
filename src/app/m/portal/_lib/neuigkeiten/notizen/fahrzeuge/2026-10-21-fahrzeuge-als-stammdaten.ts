// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "fahrzeuge",
  slug: "fahrzeuge-als-stammdaten",
  datum: "2026-10-21",
  titel: "Fahrzeuge an einer Stelle pflegen",
  inhalt: [
    absatz(
      "In der neuen App Fahrzeuge stehen alle Fahrzeuge und Anhänger der Bereitschaft mit Funkrufname, Funkkenner, Kennzeichen, Typ und Standort. " +
        "Mit Fahrzeug anlegen erfasst du ein neues, ein ausgemustertes stellst du außer Dienst.",
    ),
    absatz(
      "Unter Erstimport holst du die Fahrzeuge einmal aus Einsatzbuch, Lagerbuch und Funkgeräten und entscheidest je Vorschlag, was zusammengehört. " +
        "Die drei Apps übernehmen ihre Fahrzeuge nach und nach von hier, bis dahin pflegst du sie dort weiter wie bisher.",
    ),
  ],
};

export default notiz;
