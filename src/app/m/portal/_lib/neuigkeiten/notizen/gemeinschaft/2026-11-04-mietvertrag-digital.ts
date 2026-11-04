// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "mietvertrag-digital",
  datum: "2026-11-04",
  titel: "Mietvertrag digital unterschreiben",
  inhalt: [
    absatz(
      "Unter Vermietung, Mietvertrag lädst du die Vertragsvorlage als PDF hoch und ziehst auf der passenden Seite das Unterschriftenfeld auf. Nach einer Zusage steht er auf der Statusseite der Anfrage und wird dort mit dem Finger unterschrieben oder als Ausdruck hochgeladen.",
    ),
  ],
};

export default notiz;
