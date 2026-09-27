// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "anmelden-mit-enter",
  datum: "2026-09-27",
  titel: "Anmelden mit Enter",
  inhalt: [
    absatz(
      "Auf der Anmeldeseite genügt jetzt die Enter-Taste: sie bringt dich direkt zu Pocket ID, " +
        "genau wie der Knopf „Mit Pocket ID anmelden“. Die Seite selbst ist dabei neu gestaltet.",
    ),
  ],
};

export default notiz;
