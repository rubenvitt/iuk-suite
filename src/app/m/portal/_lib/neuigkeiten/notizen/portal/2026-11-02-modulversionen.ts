// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "modulversionen",
  datum: "2026-11-02",
  titel: "Eine Version je App",
  inhalt: [
    absatz(
      "Jede App hat jetzt eine eigene Versionsnummer, die nur steigt, wenn sich an ihr etwas ändert. " +
        "Du findest sie klein auf der Kachel unter Apps & Dienste, in der App ganz unten im Menü hinter deinem Profilbild " +
        "und gesammelt unter Profil.",
    ),
  ],
};

export default notiz;
