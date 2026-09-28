// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Admin- und Updater-Gruppe der Funkgeräte — nur sie sehen die Kachel.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "verwaltung-im-portal",
  datum: "2026-09-27",
  titel: "Funkgeräte-Verwaltung direkt aus dem Portal",
  inhalt: [
    absatz(
      "Unter „Apps & Dienste“ steht neben „Funkgeräte“ jetzt die Kachel „Funkgeräte-Verwaltung“; " +
        "sie führt ohne Umweg über die Ausleihe in die Verwaltung. " +
        "Du siehst sie nur, wenn du die Verwaltung auch öffnen darfst.",
    ),
  ],
};

export default notiz;
