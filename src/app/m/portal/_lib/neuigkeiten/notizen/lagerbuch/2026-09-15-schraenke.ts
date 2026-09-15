// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "schraenke",
  datum: "2026-09-15",
  titel: "Schränke sind jetzt eigene Lagerorte",
  inhalt: [
    absatz(
      "Unter Verwaltung → Lagerorte legst du die Schränke im Handlager mit Reihenfolge und " +
        "Zugangshinweis an; beim Zugang wählst du den passenden Schrank. In den Artikeldetails " +
        "und beim Scannen des Regaletiketts siehst du je Charge, wie viel wo liegt, samt " +
        "Zugangshinweis — auch wenn sie komplett auf einem Fahrzeug liegt.",
    ),
    hinweis("Lege deine Schränke unter Verwaltung → Lagerorte an, sonst ändert sich für dich nichts."),
  ],
};

export default notiz;
