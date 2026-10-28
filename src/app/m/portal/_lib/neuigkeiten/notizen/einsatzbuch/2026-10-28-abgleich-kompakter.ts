// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "abgleich-kompakter",
  datum: "2026-10-28",
  titel: "Abgleich zeigt zuerst die Änderungen",
  inhalt: [
    absatz(
      "Beim Abgleichen zeigt die Vorschau zuerst nur die Änderungen; „Nicht übernommen“, „Alle“ und die Suche findest du darüber. " +
        "„Übernehmen“ steht jetzt immer sichtbar unten, und die Zuordnung der Qualifikationen hat einen eigenen Reiter „Qualifikationen aus HiOrg“.",
    ),
  ],
};

export default notiz;
