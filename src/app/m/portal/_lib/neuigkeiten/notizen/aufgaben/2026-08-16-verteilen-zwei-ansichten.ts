// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "verteilen-zwei-ansichten",
  datum: "2026-08-16",
  titel: "Verteilen: dieselben Aufgaben, zwei Ansichten",
  inhalt: [
    absatz(
      "„Verteilen“ zeigt die offenen Aufgaben jetzt wahlweise als Liste oder als Brett. Die " +
        "Liste ordnet nach Frist und beantwortet, was als Nächstes dran ist. Das Brett stellt " +
        "neben den Stapel eine Spalte je Person und beantwortet, wer noch Luft hat.",
    ),
    absatz(
      "Umgeschaltet wird über den Kopf der Seite, und die Wahl steht in der Adresse: ein neu " +
        "geladener Tab zeigt dieselbe Ansicht wie vorher, ein weitergeschickter Link zeigt sie " +
        "dem Nächsten auch.",
    ),
    absatz(
      "Zugewiesen wird im Brett wie in der Liste — über den Knopf an der Aufgabe, nicht durchs " +
        "Ziehen. Am Kopf jeder Spalte steht der Auslastungsbalken der Person, damit die Zahl da " +
        "steht, wo die Entscheidung fällt.",
    ),
  ],
};

export default notiz;
