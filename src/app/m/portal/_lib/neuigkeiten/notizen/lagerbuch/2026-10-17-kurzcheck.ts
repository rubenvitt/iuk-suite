// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "kurzcheck",
  datum: "2026-10-17",
  titel: "Kurzcheck und Vollcheck",
  inhalt: [
    absatz(
      "Der Fahrzeug-Check fragt jetzt nach der Art: „Kurzcheck“ reicht vor einem Sanitätsdienst, du liest die " +
        "Plomben ab und zählst nur eine Auswahl, die das Lagerbuch nach Alter, Entnahmen und Verfall trifft. " +
        "„Vollcheck“ machst du nach der Desinfektion: alles zählen und am Ende die Plomben neu setzen.",
    ),
    absatz(
      "Welche Behälter eine Plombe tragen und welches Fach sie abdecken, legst du unter Verwaltung → Fahrzeuge " +
        "bei der Einheit im Abschnitt „Plomben“ fest.",
    ),
  ],
};

export default notiz;
