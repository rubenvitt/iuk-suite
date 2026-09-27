// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "personal-ohne-ortsverein",
  datum: "2026-09-27",
  titel: "Personal ohne Ortsverein, Qualifikation aus fester Liste",
  inhalt: [
    absatz(
      "Unter „Stammdaten“ → „Personal“ gibt es das Feld „Ortsverein“ nicht mehr, alle gehören zu Uelzen. " +
        "Die Qualifikation wählst du aus NotSan, RettAss, RS, SiK und SanH. " +
        "Eine CSV-Datei mit der alten Spalte für den Ortsverein kannst du weiter importieren, die Spalte wird übergangen.",
    ),
  ],
};

export default notiz;
