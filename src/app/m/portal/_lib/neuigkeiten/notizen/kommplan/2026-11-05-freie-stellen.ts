// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "freie-stellen",
  datum: "2026-11-05",
  titel: "Freie Stellen neben dem Hauptbaum",
  inhalt: [
    absatz(
      "Mit „+ Freie Stelle“ im Diagramm und in der Gliederung legst du eine Stelle an, die keiner anderen untersteht, etwa Polizei oder Krankenhaus. " +
        "Sie steht ohne Linie neben dem Hauptbaum und kann eigene Unterstellen bekommen.",
    ),
  ],
};

export default notiz;
