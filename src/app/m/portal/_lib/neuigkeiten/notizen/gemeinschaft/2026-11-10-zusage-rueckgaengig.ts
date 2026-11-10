// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "zusage-rueckgaengig",
  datum: "2026-11-10",
  titel: "Eine Zusage für die Bar lässt sich rückgängig machen",
  inhalt: [
    absatz(
      "Nach „Zusagen“ steht in der Meldung „Rückgängig“. Damit ist die Anfrage wieder offen, und die anfragende Person sieht keine Absage. Überschneidet sich die Anfrage mit einer anderen, fragt „Zusagen“ vorher nach.",
    ),
  ],
};

export default notiz;
