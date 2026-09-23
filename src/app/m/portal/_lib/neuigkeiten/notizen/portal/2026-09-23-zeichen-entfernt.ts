// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "zeichen-entfernt",
  datum: "2026-09-23",
  titel: "Taktische Zeichen gibt es nicht mehr",
  inhalt: [
    absatz(
      "Die pausierte App „Taktische Zeichen“ kommt nicht zurück und ist aus der Suite entfernt. " +
        "Eigene Zeichen, Merkliste und Lernstand kannst du dort nicht mehr aufrufen.",
    ),
  ],
};

export default notiz;
