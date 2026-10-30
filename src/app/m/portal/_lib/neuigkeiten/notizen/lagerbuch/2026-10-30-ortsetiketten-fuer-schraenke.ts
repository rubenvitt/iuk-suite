// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "ortsetiketten-fuer-schraenke",
  datum: "2026-10-30",
  titel: "Ortsetiketten für die Schränke",
  inhalt: [
    absatz(
      "Unter Verwaltung → Ortsetiketten bekommt jetzt auch jeder Schrank im Handlager eine eigene Karte mit Code. " +
        "Wer sie scannt, sieht nur die Artikel, die laut Buch in diesem Schrank liegen, " +
        "und die Entnahme wird zuerst aus diesem Schrank gebucht.",
    ),
  ],
};

export default notiz;
