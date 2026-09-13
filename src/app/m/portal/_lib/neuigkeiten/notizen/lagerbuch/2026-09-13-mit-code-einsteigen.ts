// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mit-code-einsteigen",
  datum: "2026-09-13",
  titel: "Mit einem Zugangs-Code direkt aus der Verwaltung einsteigen",
  inhalt: [
    absatz(
      "Unter Verwaltung → Zugangs-Codes steht neben jedem aktiven Code jetzt „Einsteigen“. Der " +
        "Knopf öffnet in einem neuen Tab genau die Ansicht, die eine Helferin nach dem Scannen " +
        "des Kärtchens sieht: das Fahrzeug, den Artikel oder die Artikel-Liste.",
    ),
    absatz(
      "Bisher musstest du dafür das Kärtchen scannen oder den Code am Einstieg abtippen. Jetzt " +
        "prüfst du mit einem Klick, wohin ein Code führt, bevor du ihn laminierst oder aushängst.",
    ),
    absatz(
      "Der Einstieg zählt wie ein Scan, also auch für „Zuletzt benutzt“. Gesperrte Codes haben " +
        "keinen Knopf, weil sie ohnehin nicht hineinlassen. Die Verwaltung bleibt im " +
        "ursprünglichen Tab offen.",
    ),
  ],
};

export default notiz;
