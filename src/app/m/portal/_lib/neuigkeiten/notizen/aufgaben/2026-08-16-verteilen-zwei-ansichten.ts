// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "verteilen-zwei-ansichten",
  datum: "2026-08-16",
  titel: "Verteilen: Liste oder Brett",
  inhalt: [
    absatz(
      "„Verteilen“ zeigt die offenen Aufgaben jetzt wahlweise als Liste oder als Brett. Die " +
        "Liste ordnet nach Frist, das Brett stellt neben den Stapel eine Spalte je Person mit " +
        "ihrer Auslastung. Umgeschaltet wird über den Kopf der Seite.",
    ),
  ],
};

export default notiz;
