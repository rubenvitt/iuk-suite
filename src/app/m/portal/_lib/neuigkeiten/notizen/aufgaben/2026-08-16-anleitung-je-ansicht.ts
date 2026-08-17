// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, liste, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "anleitung-je-ansicht",
  datum: "2026-08-16",
  titel: "Eine Anleitung, die zu der Seite gehört, auf der du stehst",
  inhalt: [
    absatz(
      "Das Modul hat eine Bedienungsanleitung bekommen — kein Handbuch für alles, sondern ein " +
        "Kapitel je Ansicht. Jedes beantwortet vier Fragen in der Reihenfolge, in der sie vor " +
        "einer fremden Fläche entstehen:",
    ),
    liste(
      "Wo bin ich hier? Eine beschriftete Skizze der Seite.",
      "Was tue ich? Die Schritte, in der Reihenfolge, in der man sie geht.",
      "Wie hängt das zusammen? Schaubilder zu Fristen, Freigaben und Nachweisen.",
      "Warum geht das nicht? Die Grenzen, jeweils mit dem Grund dahinter.",
    ),
    absatz(
      "Zwei Wege hinein: der Eintrag „Anleitung“ in der Navigation, und der Verweis in der " +
        "Kopfzeile jeder Ansicht. Der zweite führt direkt in das Kapitel zu genau dieser " +
        "Ansicht, nicht auf die erste Seite.",
    ),
    absatz(
      "Die Skizzen sind gezeichnet und keine Bildschirmfotos. Sie nehmen ihre Farben aus " +
        "denselben Werten wie die Flächen, die sie erklären, und wechseln deshalb mit hell und " +
        "dunkel mit.",
    ),
  ],
};

export default notiz;
