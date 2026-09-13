// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (siehe „drohnentraining-in-der-suite" daneben) —
// die Änderung sehen die Trainierenden, die Rückfragen bekommt die Verwaltung.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "trainingsansicht-ohne-suite-leiste",
  datum: "2026-08-29",
  titel: "Mehr Platz in der Trainingsansicht",
  inhalt: [
    absatz(
      "Über der Trainingsansicht steht nicht mehr die Kopfzeile der Suite, sondern nur noch der " +
        "Name der App und rechts ein Weg in die Verwaltung. Auf dem Telefon bleibt dadurch mehr " +
        "Platz, und die Seite lässt sich nicht mehr über den rechten Rand hinausschieben.",
    ),
    absatz(
      "Hell und Dunkel folgen dort jetzt der Einstellung des Geräts. Am Zugang ändert sich " +
        "nichts.",
    ),
  ],
};

export default notiz;
