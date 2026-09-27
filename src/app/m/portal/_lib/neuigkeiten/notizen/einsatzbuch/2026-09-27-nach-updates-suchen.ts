// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "nach-updates-suchen",
  datum: "2026-09-27",
  titel: "Desktop-App: Nach Updates suchen",
  inhalt: [
    absatz(
      "In der Desktop-App zeigt „Einstellungen“ → „Update“ jetzt die installierte Version und die letzte Suche. " +
        "Mit „Nach Updates suchen“ prüfst du sofort. " +
        "Installiert wird weiter erst, wenn du abgemeldet bist und kein Einsatz aussteht.",
    ),
  ],
};

export default notiz;
