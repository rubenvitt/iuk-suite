// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Admin- und Updater-Gruppe der Funkgeräte.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "update-modus-fuers-telefon",
  datum: "2026-09-27",
  titel: "Update-Modus für das Telefon",
  inhalt: [
    absatz(
      "Verwaltung → Update-Modus hat große Felder und Knöpfe in einer Spalte, damit du ihn " +
        "am Telefon neben dem Gerät bedienen kannst. Zum Aktualisieren tippst du zweimal und " +
        "kannst es danach kurz rückgängig machen. Jede Karte zeigt auch die bisherige Version.",
    ),
  ],
};

export default notiz;
