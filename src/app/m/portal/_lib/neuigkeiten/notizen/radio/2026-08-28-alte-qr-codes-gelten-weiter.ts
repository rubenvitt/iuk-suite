// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "alte-qr-codes-gelten-weiter",
  datum: "2026-08-28",
  titel: "Die alten QR-Codes zum Öffnen der Ausleihe gelten weiter",
  inhalt: [
    absatz(
      "Der QR-Code, der bisher an den Tablets und im Funkraum hing, um die Ausleihe zu öffnen, " +
        "funktioniert wieder. Du scannst ihn wie gewohnt und landest direkt in der Geräteliste, " +
        "ohne einen Zugangs-Code einzutippen. Bis heute zeigte der Scan nur das leere Codefeld.",
    ),
    absatz(
      "Hinter dem alten Code steht jetzt einer der Zugangscodes aus Verwaltung → Zugänge. Wer ihn " +
        "dort deaktiviert, schaltet damit auch den alten QR-Code ab — genau wie bei jedem neuen " +
        "Aufsteller-Code.",
    ),
    absatz(
      "Der alte Code ist eine Übergangslösung mit festem Enddatum. Bis dahin ersetzt du die " +
        "hängenden Blätter durch das neue Druckblatt aus Verwaltung → Zugänge → Druckblatt.",
    ),
  ],
};

export default notiz;
