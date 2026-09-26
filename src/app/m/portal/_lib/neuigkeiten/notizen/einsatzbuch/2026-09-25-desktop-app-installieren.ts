// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
// Am Tag des Rollouts gibt es noch kein Release der App (der Updater-Schlüssel fehlt noch),
// deshalb „kommt“ und „sobald“ statt „lässt sich jetzt installieren“.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "desktop-app-installieren",
  datum: "2026-09-25",
  titel: "Eine Desktop-App für die Einsatzbuch-Rechner",
  inhalt: [
    absatz(
      "Für die Einsatzbuch-Rechner kommt eine Desktop-App für Windows und macOS, die sich selbst aktuell hält. " +
        "Sobald die erste Version erschienen ist, findest du sie auf GitHub unter den Releases von „iuk-suite“ als „Einsatzbuch“. " +
        "Unter „Rechner“ siehst du dann für jeden Rechner den letzten Kontakt und die letzte Sicherung.",
    ),
  ],
};

export default notiz;
