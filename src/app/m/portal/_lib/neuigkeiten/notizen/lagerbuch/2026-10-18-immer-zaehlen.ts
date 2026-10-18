// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "immer-zaehlen",
  datum: "2026-10-18",
  titel: "Material, das in jedem Kurzcheck dran ist",
  inhalt: [
    absatz(
      "In der Soll-Bestückung einer Einheit und unter Verwaltung → Vorlagen gibt es die Spalte „Immer zählen“. " +
        "Was du dort ankreuzt, kommt in jeden Kurzcheck dazu, ohne der übrigen Auswahl Platz wegzunehmen. " +
        "Liegt es in einem Fach mit stehender Plombe, reicht weiter das Ablesen der Plombe.",
    ),
  ],
};

export default notiz;
