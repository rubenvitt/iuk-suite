// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes“.
// Zielgruppe: Gruppenleitung und Feedback-Verwaltung (switcherGroupSources:
// ["access", "admin"] in core/registry.ts) — die Teilnehmenden am Bogen sehen
// das Portal nie, wohl aber die Person, die das Handy herumgibt.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "danke-seite-nur-danke",
  datum: "2026-09-19",
  titel: "Die Danke-Seite sagt nur noch danke",
  inhalt: [
    absatz(
      "Nach dem Absenden steht auf dem Bogen kein „Handy wandert weiter?“ mit " +
        "„Leeren Bogen öffnen“ mehr — dort endet die Rückmeldung jetzt mit dem Dank. " +
        "Wer das Handy weitergibt, ruft den Link einfach noch einmal auf: die nächste Person " +
        "bekommt den Knopf dann dort, wo sie ihn braucht.",
    ),
  ],
};

export default notiz;
