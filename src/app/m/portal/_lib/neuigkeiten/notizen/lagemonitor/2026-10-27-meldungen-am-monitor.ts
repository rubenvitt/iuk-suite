// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "meldungen-am-monitor",
  datum: "2026-10-27",
  titel: "Meldungen als Band am Lagemonitor",
  inhalt: [
    absatz(
      "Unter Meldungen am Monitor legst du einen kurzen Hinweis an, etwa „Nächste Lagebesprechung“, der als blaues Band unter der Kopfzeile steht. " +
        "Mit einer Uhrzeit zählt der Monitor bis dahin herunter, und jede Meldung verschwindet von selbst, ohne Angabe nach 24 Stunden.",
    ),
  ],
};

export default notiz;
