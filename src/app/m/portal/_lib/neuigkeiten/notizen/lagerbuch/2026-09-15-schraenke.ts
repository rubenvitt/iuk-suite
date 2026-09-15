// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "schraenke",
  datum: "2026-09-15",
  titel: "Schränke sind jetzt eigene Lagerorte",
  inhalt: [
    absatz(
      "Schränke im Handlager sind jetzt eigene Lagerorte. Unter Verwaltung → Lagerorte legst du " +
        "sie an, gibst ihnen eine Reihenfolge und einen Zugangshinweis; beim Zugang wählst du " +
        "dann, in welchen Schrank die Ware kommt.",
    ),
    absatz(
      "Im Artikeldetail und in der Helferansicht siehst du bei jeder Charge, wo wie viel davon " +
        "liegt, samt Zugangshinweis — auch eine Charge, die vollständig auf einem Fahrzeug " +
        "liegt, war vorher gar nicht zu sehen.",
    ),
    hinweis(
      "Lege eure Schränke unter Verwaltung → Lagerorte an, sonst ändert sich für niemanden etwas.",
    ),
  ],
};

export default notiz;
