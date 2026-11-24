// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "helfer",
  slug: "zugang-lifeline",
  datum: "2026-11-25",
  titel: "Helfer an Lifeline Hub geben",
  inhalt: [
    absatz(
      "Lifeline Hub kann die fürs Einsatztagebuch bereitgestellten Helfer jetzt mit Name und Qualifikationen abholen. " +
        "Leg dazu unter Einstellungen bei „Zugang für Lifeline Hub“ einen Zugang an und trag Adresse und Schlüssel in Lifeline Hub unter Anbindungen ein.",
    ),
  ],
};

export default notiz;
