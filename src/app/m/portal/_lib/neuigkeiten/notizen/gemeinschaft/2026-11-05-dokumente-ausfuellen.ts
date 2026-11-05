// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "dokumente-ausfuellen",
  datum: "2026-11-05",
  titel: "Mietvertrag, Übergabe und Rückgabe ausfüllen",
  inhalt: [
    absatz(
      "Unter Vermietung, Verträge legst du Vorlagen für Mietvertrag, Übergabe und Rückgabe an; Formularfelder werden erkannt, weitere ziehst du auf. Zu jeder Zusage füllst du daraus ein Dokument aus und gibst es frei. Erst unterschreibt die mietende Person, auf ihrer Statusseite oder vor Ort, danach du.",
    ),
  ],
};

export default notiz;
