// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "suche-ueber-alle-module",
  datum: "2026-10-31",
  titel: "In allen Modulen suchen",
  inhalt: [
    absatz(
      "Im Portal gibt es jetzt den Eintrag „Suche“. Dort gibst du eine Seriennummer, einen " +
        "Funkkenner, ein Kennzeichen oder einen Artikel ein und siehst Treffer aus den " +
        "Funkgeräten, den Fahrzeugen und dem Lagerbuch, aber nur aus den Bereichen, die du " +
        "selbst öffnen darfst.",
    ),
  ],
};

export default notiz;
