// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "mietvertrag-digital",
  datum: "2026-11-04",
  titel: "Mietvertrag digital unterschreiben",
  inhalt: [
    absatz(
      "Unter Vermietung, Mietvertrag lädst du die Vorlage als PDF hoch und ziehst das Unterschriftenfeld auf. Nach einer Zusage wird der Vertrag auf der Statusseite mit dem Finger unterschrieben oder als Ausdruck hochgeladen; ist Digital unterschreiben aus, nur als Ausdruck.",
    ),
  ],
};

export default notiz;
