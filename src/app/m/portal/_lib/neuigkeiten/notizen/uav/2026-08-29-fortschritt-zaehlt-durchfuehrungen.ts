// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (siehe die Notiz „katalog-ohne-code-ansehen" daneben).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "fortschritt-zaehlt-durchfuehrungen",
  datum: "2026-08-29",
  titel: "Der Fortschritt zählt jetzt auch einzelne Durchführungen",
  inhalt: [
    absatz(
      "Die Fortschrittskarte nennt neben den erledigten Aufgaben auch die erfassten " +
        "Durchführungen, etwa „3 von 6 Durchführungen erfasst“, und der Balken zeigt beides. " +
        "Bisher stand er auf 0 Prozent, solange keine Aufgabe vollständig war — wer zwei von drei " +
        "geforderten Flügen hinter sich hatte, sah dieselbe leere Anzeige wie am ersten Tag.",
    ),
    absatz(
      "Wie eine Aufgabe als erledigt zählt, ändert sich dadurch nicht. Die Zahl der erledigten " +
        "Aufgaben, die Auswertung je Teilnehmer und die CSV-Ausgaben in der Verwaltung rechnen " +
        "unverändert. Die Durchführungszahl steht daneben, sie ersetzt nichts.",
    ),
    absatz(
      "Das Datum einer Durchführung steht in der Liste jetzt in deutscher Schreibweise, also " +
        "13.01.2026 statt 2026-01-13. Beim Eintragen zeigt das Feld weiterhin die Form, die der " +
        "Browser vorgibt — das lässt sich nicht beeinflussen, deshalb steht die deutsche Form " +
        "daneben, sobald ein Datum gewählt ist.",
    ),
  ],
};

export default notiz;
