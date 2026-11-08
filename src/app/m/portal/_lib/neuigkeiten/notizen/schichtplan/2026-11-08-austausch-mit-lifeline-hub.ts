// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "schichtplan",
  slug: "austausch-mit-lifeline-hub",
  datum: "2026-11-08",
  titel: "Schichtplan an Lifeline Hub übergeben",
  inhalt: [
    absatz(
      "Die Excel-Datei unter Ausgabe hat jetzt zusätzlich das Blatt Austausch. " +
        "Lifeline Hub liest diese Datei unter Schichtplan einlesen direkt ein, mit allen Schichten, den eingeteilten Helfern und den Schichten, die noch niemand besetzt.",
    ),
  ],
};

export default notiz;
