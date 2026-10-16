// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "box-suche",
  datum: "2026-10-16",
  titel: "Suchen beim Ablegen in die Box",
  inhalt: [
    absatz(
      "Unter „Box“ kannst du nach der Wahl der Einheit jetzt nach einem Artikel suchen, " +
        "statt durch die ganze Liste zu scrollen. Was du abgelegt hast, bestätigt die Leiste " +
        "unten am Schirm, und unter „Liste“ siehst du alles aus dieser Runde.",
    ),
  ],
};

export default notiz;
