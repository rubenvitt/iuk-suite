// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "dienste-bearbeiten",
  datum: "2026-11-10",
  titel: "Dienste bearbeiten",
  inhalt: [
    absatz(
      "Unter „Dienste verwalten“ änderst du Name, Adresse, Beschreibung und Kategorie eines " +
        "Dienstes über das Menü am Ende seiner Zeile. Dort steht auch „Löschen“, und das fragt " +
        "jetzt vorher nach. Neue Dienste legst du oben mit „Dienst anlegen“ an.",
    ),
  ],
};

export default notiz;
