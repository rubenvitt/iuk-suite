// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "verweis-auf-plan",
  datum: "2026-11-05",
  titel: "Stellen verweisen auf andere Pläne",
  inhalt: [
    absatz(
      "Unter „Verweis auf Plan“ wählst du beim Bearbeiten einer Stelle einen anderen Kommunikationsplan aus. " +
        "Die Karte zeigt dann seinen Titel und öffnet ihn per Klick, auf dem Ausdruck steht der Titel als Hinweis.",
    ),
  ],
};

export default notiz;
