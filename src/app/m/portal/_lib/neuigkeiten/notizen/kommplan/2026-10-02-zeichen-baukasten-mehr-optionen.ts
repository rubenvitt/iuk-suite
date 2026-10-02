// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "zeichen-baukasten-mehr-optionen",
  datum: "2026-10-02",
  titel: "Mehr Möglichkeiten beim Bauen eigener Zeichen",
  inhalt: [
    absatz(
      "Fähigkeiten und Körpermarken kannst du jetzt an fast jedem Grundzeichen setzen, und unter „Fähigkeiten“ mehrere nebeneinander. " +
        "Was die Vorschrift so nicht zeigt, trägt in der Auswahl den Zusatz „(abgeleitet)“, und die Vorschau sagt, welcher Teil abgeleitet ist.",
    ),
  ],
};

export default notiz;
