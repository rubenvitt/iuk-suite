// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (siehe „drohnentraining-in-der-suite" daneben).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "fortschritt-zaehlt-durchfuehrungen",
  datum: "2026-08-29",
  titel: "Der Fortschritt zählt einzelne Durchführungen",
  inhalt: [
    absatz(
      "Die Fortschrittskarte nennt neben den erledigten Aufgaben auch die erfassten " +
        "Durchführungen, etwa „3 von 6“, und der Balken zeigt beides. Bisher stand er auf null, " +
        "solange keine Aufgabe vollständig war.",
    ),
  ],
};

export default notiz;
