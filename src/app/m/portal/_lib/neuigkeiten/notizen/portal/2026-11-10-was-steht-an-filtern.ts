// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "was-steht-an-filtern",
  datum: "2026-11-10",
  titel: "„Was steht an“ filtern",
  inhalt: [
    absatz(
      "Unter „Was steht an“ wählst du oben „Überfällig“ oder „Bald fällig“ und, wenn du mehrere Module " +
        "verwaltest, ein Modul. Jede Zeile führt mit einem Tipp an die Stelle, an der du die Sache erledigst.",
    ),
  ],
};

export default notiz;
