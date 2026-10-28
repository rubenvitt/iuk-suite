// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "stichwort-als-freitext",
  datum: "2026-10-28",
  titel: "Desktop-App: Alarmstichwort als Freitext",
  inhalt: [
    absatz(
      "Beim Erfassen steht über den Stichworten jetzt das Feld „Stichwort, Freitext“. " +
        "Ein angetipptes Stichwort landet dort, du kannst es ergänzen oder ein eigenes schreiben.",
    ),
  ],
};

export default notiz;
