// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "anleitung-je-ansicht",
  datum: "2026-08-16",
  titel: "Zu jeder Ansicht eine eigene Anleitung",
  inhalt: [
    absatz(
      "Das Modul hat eine Anleitung bekommen — ein Kapitel je Ansicht. Du erreichst sie über " +
        "„Anleitung“ in der Navigation und über den Verweis in der Kopfzeile jeder Ansicht; der " +
        "zweite Weg führt direkt in das Kapitel zu der Seite, auf der du gerade stehst.",
    ),
  ],
};

export default notiz;
