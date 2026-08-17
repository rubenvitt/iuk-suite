// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "von-allen-geraeten-abmelden",
  datum: "2026-08-14",
  titel: "Von allen Geräten abmelden",
  inhalt: [
    absatz(
      "Im Nutzermenü oben rechts steht jetzt „Profil“. Die Seite zeigt, als wer du angemeldet " +
        "bist, welche Gruppen an deinem Konto hängen und seit wann deine Sitzung läuft.",
    ),
    absatz(
      "Darunter liegt der Knopf „Von allen Geräten abmelden“. Er beendet nicht nur die Sitzung " +
        "in diesem Browser, sondern jede Sitzung deines Kontos — Telefon, Tablet, den Rechner in " +
        "der Wache. Danach verlangt jede App wieder eine Anmeldung.",
    ),
    hinweis(
      "Wenn ein Gerät abhandenkommt, ist das der kurze Weg: einmal abmelden, einmal neu " +
        "anmelden. Wer das Gerät findet, kommt damit in keine App mehr hinein.",
    ),
  ],
};

export default notiz;
