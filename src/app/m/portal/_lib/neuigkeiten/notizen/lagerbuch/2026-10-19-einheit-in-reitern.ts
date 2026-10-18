// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "einheit-in-reitern",
  datum: "2026-10-19",
  titel: "Die Seite einer Einheit ist in Reiter gegliedert",
  inhalt: [
    absatz(
      "Eine Einheit unter Verwaltung → Fahrzeuge & Taschen öffnet jetzt auf „Bestand & Verfall“, Auffälliges steht oben. " +
        "Das Soll änderst du im Reiter „Soll“ nach „Bearbeiten“. " +
        "Art, Vorlage, Aktiv und Löschen stehen unter „Einstellungen“, „Checkliste drucken“ hinter den drei Punkten oben rechts.",
    ),
  ],
};

export default notiz;
