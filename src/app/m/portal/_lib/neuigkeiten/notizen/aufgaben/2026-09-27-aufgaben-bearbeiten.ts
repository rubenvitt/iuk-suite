// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "aufgaben-bearbeiten",
  datum: "2026-09-27",
  titel: "Aufgaben nachträglich ändern",
  inhalt: [
    absatz(
      "Wer eine Aufgabe eingestellt hat, ändert sie jetzt über „Bearbeiten“ in der Aufgabe, " +
        "bis sie zur Freigabe gemeldet ist; jede Änderung steht danach im Verlauf. Eine doppelt " +
        "eingestellte Aufgabe lässt sich außerdem zurückziehen, solange niemand daran arbeitet, " +
        "auch wenn sie schon verteilt ist.",
    ),
  ],
};

export default notiz;
