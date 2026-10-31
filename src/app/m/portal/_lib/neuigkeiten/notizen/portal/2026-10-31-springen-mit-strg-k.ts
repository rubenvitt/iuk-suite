// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "springen-mit-strg-k",
  datum: "2026-10-31",
  titel: "Mit Strg+K überall hinspringen",
  inhalt: [
    absatz(
      "Drück auf jeder Seite Strg+K, am Mac ⌘K, oder tipp oben auf die Lupe. Mit ein paar " +
        "Buchstaben und Enter springst du zu einer Seite, einer App oder einem Dienst; passt " +
        "nichts, sucht die letzte Zeile in allen Modulen nach deinem Begriff.",
    ),
    absatz(
      "Auch das Suchfeld auf der Startseite zeigt jetzt unter den Apps die Treffer aus den Modulen.",
    ),
  ],
};

export default notiz;
