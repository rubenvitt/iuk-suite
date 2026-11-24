// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "veranstaltungen",
  slug: "veranstaltungen-pflegen",
  datum: "2026-11-25",
  titel: "Veranstaltungen an einem Ort pflegen",
  inhalt: [
    absatz(
      "Unter Veranstaltungen trägst du Sanitätsdienste, Betreuungen und Übungen mit Ort, Zeitraum, Veranstalter und Status ein. " +
        "Mit Neue Veranstaltung legst du eine an, mit Ändern passt du sie an oder sagst sie ab.",
    ),
  ],
};

export default notiz;
