// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mit-code-einsteigen",
  datum: "2026-09-13",
  titel: "Zugangs-Codes vorab ausprobieren",
  inhalt: [
    absatz(
      "Unter Verwaltung → Zugangs-Codes öffnet „Einsteigen“ in einem neuen Tab die Ansicht, die " +
        "eine Helferin nach dem Scannen des Kärtchens sieht. So prüfst du mit einem Klick, wohin " +
        "ein Code führt, bevor du ihn laminierst. Gesperrte Codes haben keinen Knopf.",
    ),
  ],
};

export default notiz;
