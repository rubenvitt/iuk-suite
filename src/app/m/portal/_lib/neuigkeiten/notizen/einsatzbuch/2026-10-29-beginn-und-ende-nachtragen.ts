// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "beginn-und-ende-nachtragen",
  datum: "2026-10-29",
  titel: "Desktop-App: Beginn und Ende trägst du selbst ein",
  inhalt: [
    absatz(
      "Unter „Zeit und Einsatzort“ steht beim Beginn nicht mehr die aktuelle Uhrzeit. " +
        "Du trägst Beginn und Ende so ein, wie der Einsatz war, und ohne Ende wird nicht abgesendet.",
    ),
  ],
};

export default notiz;
