// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "schichtplan",
  slug: "planung-zu-veranstaltung-und-einsatz",
  datum: "2026-11-25",
  titel: "Planung zu Veranstaltung und Einsatz",
  inhalt: [
    absatz(
      "Bei Neue Planung wählst du unter Veranstaltung eine aus dem Modul Veranstaltungen, dann stehen Name, Ort und Zeitraum schon drin. " +
        "Unter Einsatz in Lifeline Hub trägst du den Link zum Einsatz ein; im Kopf der Planung öffnet Einsatz öffnen ihn dann direkt.",
    ),
  ],
};

export default notiz;
