// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "feedback-in-der-suite",
  datum: "2026-10-12",
  titel: "Feedback direkt in der Suite",
  inhalt: [
    absatz(
      "Feedback schreibst du jetzt direkt in der Suite: im Nutzermenü unter „Feedback geben“ oder über " +
        "die Kachel im Portal. Die Seite, auf der du gerade bist, wird mitgeschickt, und du bekommst eine " +
        "Nummer, unter der wir deine Rückmeldung wiederfinden.",
    ),
  ],
};

export default notiz;
