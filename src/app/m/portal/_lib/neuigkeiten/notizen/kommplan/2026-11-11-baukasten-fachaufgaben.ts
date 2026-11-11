// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "baukasten-fachaufgaben",
  datum: "2026-11-11",
  titel: "Eigene Zeichen einfacher bauen",
  inhalt: [
    absatz(
      "Unter Bibliothek → Zeichen zeigt der Baukasten nur noch, was zum gewählten Grundzeichen passt. " +
        "Fähigkeiten und Körpermarken findest du jetzt zusammen unter „Fachaufgaben“. " +
        "Über der Vorschau steht, ob das Zeichen vermessen, abgeleitet oder vereinfacht ist; fehlt etwas im Bild, steht dort, was und warum.",
    ),
  ],
};

export default notiz;
