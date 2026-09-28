// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "update-unten-rechts",
  datum: "2026-09-28",
  titel: "Desktop-App: Updates unten rechts",
  inhalt: [
    absatz(
      "Die Desktop-App zeigt unten rechts, wenn ein Update ansteht, auch ohne Anmeldung. " +
        "Während sie es installiert, dreht sich dort ein Kreis; danach startet sie neu.",
    ),
  ],
};

export default notiz;
