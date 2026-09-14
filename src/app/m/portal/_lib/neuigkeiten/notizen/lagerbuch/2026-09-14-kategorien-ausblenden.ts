// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "kategorien-ausblenden",
  datum: "2026-09-14",
  titel: "Artikel nach Kategorie ausblenden",
  inhalt: [
    absatz(
      "Artikel haben jetzt eine Kategorie, die du in den Stammdaten des Artikels einträgst. " +
        "Unter Verwaltung → Artikel & Bestand blendest du mit „Kategorien ausblenden“ aus, " +
        "was dich nicht betrifft. Die Auswahl bleibt für dein Konto gespeichert, auch auf anderen Geräten.",
    ),
  ],
};

export default notiz;
