// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "springen-mit-strg-k",
  datum: "2026-10-31",
  titel: "Mit Strg+K überall hinspringen",
  inhalt: [
    absatz(
      "Drück auf jeder Seite Strg+K, am Mac ⌘K, oder tipp oben auf die Lupe: Mit ein paar " +
        "Buchstaben und Enter springst du zu einer Seite, App oder einem Dienst, sonst sucht " +
        "die letzte Zeile in allen Modulen. Das Suchfeld der Startseite zeigt diese Treffer " +
        "jetzt unter den Apps.",
    ),
  ],
};

export default notiz;
