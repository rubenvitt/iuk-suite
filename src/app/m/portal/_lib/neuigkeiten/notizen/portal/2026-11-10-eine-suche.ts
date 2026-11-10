// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "eine-suche",
  datum: "2026-11-10",
  titel: "Eine Suche im Menü",
  inhalt: [
    absatz(
      "„Springen zu“ im Menü findet jetzt neben Seiten, Apps und Diensten auch Funkgeräte, Fahrzeuge und Artikel " +
        "aus den Modulen. Das Suchfeld auf der Startseite gibt es dafür nicht mehr. Am Telefon erreichst du die " +
        "Suche über den Knopf oben, der das Menü öffnet.",
    ),
  ],
};

export default notiz;
