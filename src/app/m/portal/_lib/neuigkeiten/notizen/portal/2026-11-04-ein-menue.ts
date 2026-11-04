// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "ein-menue",
  datum: "2026-11-04",
  titel: "Ein Menü für Seiten und Apps",
  inhalt: [
    absatz(
      "Seiten und Apps stehen jetzt in einem Menü links, auf dem Telefon hinter dem Knopf oben mit App und Seite. " +
        "Tippst du oben im Menü auf die App, wechselst du zu allen Apps, und über Springen zu findest du Seiten und Apps per Suche. " +
        "Dein Profil, Abmelden und Hell oder Dunkel stehen unten im Menü.",
    ),
  ],
};

export default notiz;
