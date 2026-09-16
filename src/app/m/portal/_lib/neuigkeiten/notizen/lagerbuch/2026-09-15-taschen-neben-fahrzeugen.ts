// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "taschen-neben-fahrzeugen",
  datum: "2026-09-15",
  titel: "Taschen neben Fahrzeugen führen",
  inhalt: [
    absatz(
      "„Fahrzeuge“ heißt jetzt „Fahrzeuge & Taschen“: dort führst du auch Sanitätstaschen und " +
        "Rucksäcke — mit Soll-Bestückung, Bestand, Verfall und Checkliste wie bei einem Fahrzeug. " +
        "Beim Anlegen wählst du zuerst, ob es ein Fahrzeug oder eine Tasche ist.",
    ),
    hinweis(
      "Deine vorhandenen Einträge stehen auf „nicht zugeordnet“. Öffne den Eintrag und trage " +
        "unter „Art“ nach, ob es ein Fahrzeug oder eine Tasche ist.",
    ),
  ],
};

export default notiz;
