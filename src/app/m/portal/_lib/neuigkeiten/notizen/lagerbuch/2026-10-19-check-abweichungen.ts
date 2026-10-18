// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-abweichungen",
  datum: "2026-10-19",
  titel: "Ein Check zeigt zuerst, was nicht gestimmt hat",
  inhalt: [
    absatz(
      "Unter Verwaltung → Checks zeigt ein geöffneter Check in jedem Abschnitt zuerst nur die Zeilen mit Abweichung. " +
        "Mit „Alle anzeigen“ siehst du alle Positionen, Abschnitte ohne Abweichung stehen unten als eine Zeile mit „Anzeigen“.",
    ),
  ],
};

export default notiz;
