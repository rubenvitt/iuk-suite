// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "neue-schrift-und-weitere-zeichen",
  datum: "2026-10-18",
  titel: "Neue Schrift in den Plänen und 38 weitere Zeichen",
  inhalt: [
    absatz(
      "Kürzel in den Zeichen und der Text deiner Pläne stehen jetzt in einer neuen Schrift nach der Vorlage der Zeichen. " +
        "Sie setzt etwas schmaler, manche Einheit passt jetzt in eine Zeile. " +
        "Dazu kommen 38 weitere Zeichen, vor allem Feuerwehrfahrzeuge und Abrollbehälter.",
    ),
  ],
};

export default notiz;
