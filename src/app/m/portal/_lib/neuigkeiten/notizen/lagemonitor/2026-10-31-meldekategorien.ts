// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "meldekategorien",
  datum: "2026-10-31",
  titel: "Kategorien für Meldungen am Lagemonitor",
  inhalt: [
    absatz(
      "Jede Meldung am Monitor bekommt jetzt eine Kategorie wie Lagemeldung, Besprechung oder Ablösung, mit eigenem Zeichen und eigener Farbe. " +
        "Unter Meldekategorien legst du weitere an und stellst ein, wie viele Minuten vor der Uhrzeit eine Meldung zu blinken beginnt.",
    ),
  ],
};

export default notiz;
