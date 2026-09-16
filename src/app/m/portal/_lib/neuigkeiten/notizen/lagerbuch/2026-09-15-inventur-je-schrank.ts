// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-je-schrank",
  datum: "2026-09-15",
  titel: "Inventur für einen einzelnen Schrank",
  inhalt: [
    absatz(
      "Unter Verwaltung → Inventur wählst du oben den Zählort: den ganzen Handlager, einen " +
        "einzelnen Schrank oder alles, was noch keinem Schrank zugeordnet ist. Die erwartete " +
        "Menge jeder Zeile gilt dann für diesen Ort, und eine Korrektur wird auch dort gebucht.",
    ),
    absatz(
      "Ein Lauf zählt genau einen Ort. Sobald du die erste Menge erfasst hast, steht der Zählort " +
        "bis zum Abschluss fest; im Verlauf siehst du bei jedem Lauf, wo gezählt wurde.",
    ),
  ],
};

export default notiz;
