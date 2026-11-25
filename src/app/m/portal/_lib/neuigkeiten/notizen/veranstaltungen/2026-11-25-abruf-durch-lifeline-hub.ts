// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "veranstaltungen",
  slug: "abruf-durch-lifeline-hub",
  datum: "2026-11-25",
  titel: "Veranstaltungen an Lifeline Hub geben",
  inhalt: [
    absatz(
      "Unter Abruf-Zugänge legst du einen Zugang für Lifeline Hub an und trägst Adresse und Schlüssel dort unter Anbindungen ein. " +
        "Lifeline Hub holt die Veranstaltungen dann regelmäßig ab, auch Absagen; Personen gehen dabei nicht mit.",
    ),
  ],
};

export default notiz;
