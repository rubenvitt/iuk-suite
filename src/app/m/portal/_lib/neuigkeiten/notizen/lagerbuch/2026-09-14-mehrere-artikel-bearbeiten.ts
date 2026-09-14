// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mehrere-artikel-bearbeiten",
  datum: "2026-09-14",
  titel: "Mehrere Artikel auf einmal ändern",
  inhalt: [
    absatz(
      "Unter Verwaltung → Artikel & Bestand kannst du Zeilen ankreuzen und mit „Auswahl " +
        "bearbeiten“ allen zusammen eine Kategorie, ein Fach oder einen Status geben. Bevor du " +
        "speicherst, steht da, welcher Artikel sich ändert und welcher den Wert schon hat.",
    ),
  ],
};

export default notiz;
