// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "journal-nachladen",
  datum: "2026-09-14",
  titel: "Journal reicht weiter als die neuesten 100",
  inhalt: [
    absatz(
      "Unter Verwaltung → Journal endete die Liste bisher bei den neuesten 100 Buchungen. " +
        "Jetzt lädt sie beim Scrollen weiter, bis du am Anfang der Historie angekommen bist. " +
        "Suche und Zeitraum greifen dabei wie bisher auf das ganze Journal.",
    ),
  ],
};

export default notiz;
