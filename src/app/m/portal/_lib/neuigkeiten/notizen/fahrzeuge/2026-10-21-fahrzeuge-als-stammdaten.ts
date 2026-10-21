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
      "Einsatzbuch, Lagerbuch und Funkgeräte übernehmen ihre Fahrzeuge nach und nach von hier. Bis dahin pflegst du sie dort weiter wie bisher.",
    ),
  ],
};

export default notiz;
