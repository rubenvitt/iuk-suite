// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "meldungen-planen",
  datum: "2026-11-01",
  titel: "Meldungen am Lagemonitor planen",
  inhalt: [
    absatz(
      "Unter Meldungen am Monitor legst du mit „Anzeigen ab“ fest, wann eine Meldung erscheint; höchstens drei stehen gleichzeitig am Monitor, weitere warten. " +
        "Unter Meldekategorien stellst du ein, wann eine Meldung nach ihrer Uhrzeit verschwindet. " +
        "„Live-Lagemonitor öffnen“ zeigt den Monitor in einem neuen Tab.",
    ),
  ],
};

export default notiz;
