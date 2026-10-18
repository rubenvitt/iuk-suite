// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "einheit-in-reitern",
  datum: "2026-10-19",
  titel: "Die Seite einer Einheit ist in Reiter gegliedert",
  inhalt: [
    absatz(
      "Unter Verwaltung → Fahrzeuge & Taschen öffnet eine Einheit jetzt auf „Bestand & Verfall“: " +
        "Was abgelaufen ist, bald abläuft oder unter Soll liegt, steht oben, ein Klick auf die Kachel „abgelaufen“ filtert danach. " +
        "Das Soll liest du im Reiter „Soll“ nach Fächern, ändern kannst du es nach dem Schalter „Bearbeiten“.",
    ),
    absatz(
      "Art, Vorlage, Aktiv und Löschen findest du jetzt unter „Einstellungen“, " +
        "„Checkliste drucken“ hinter dem Knopf mit den drei Punkten oben rechts.",
    ),
  ],
};

export default notiz;
