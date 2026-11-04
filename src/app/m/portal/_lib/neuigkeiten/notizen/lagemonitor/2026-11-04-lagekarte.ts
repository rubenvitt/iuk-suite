// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "lagekarte",
  datum: "2026-11-04",
  titel: "Feste Punkte und Flächen auf allen Lagemonitoren",
  inhalt: [
    absatz(
      "Unter Lagekarte legst du mit Neuer Punkt oder Neue Fläche feste Objekte an, etwa eine Wache mit Zeichen oder einen Bereitstellungsraum. " +
        "Den Ort setzt du per Klick auf die Karte, eine Fläche zeichnest du Eckpunkt für Eckpunkt. Der Schalter je Objekt bestimmt, ob es auf den Monitoren erscheint.",
    ),
  ],
};

export default notiz;
