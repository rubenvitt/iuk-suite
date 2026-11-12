// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "fahrzeuge",
  slug: "fahrzeugakte",
  datum: "2026-11-12",
  titel: "Prüftermine, Reifen und Kilometer je Fahrzeug",
  inhalt: [
    absatz(
      "Unter Fahrzeugtafel siehst du für jedes Fahrzeug, wann HU, UVV, Service und weitere Prüfungen fällig sind und ob die Reifen passen. " +
        "Gelb heißt bald fällig, rot überfällig. Als Hallentafel zeigen bringt dieselbe Übersicht groß auf einen Bildschirm in der Fahrzeughalle.",
    ),
    absatz(
      "Ein Klick auf ein Fahrzeug öffnet seine Akte. Dort trägst du mit Verwaltungsrecht Prüfungen als erledigt ein und pflegst Reifensätze, Kilometerstand und technische Daten.",
    ),
  ],
};

export default notiz;
