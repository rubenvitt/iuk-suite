// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "code-auf-der-handlagerkarte",
  datum: "2026-09-16",
  titel: "Zugangs-Code auf der Handlager-Karte",
  inhalt: [
    absatz(
      "Unter „Verwaltung → Ortsetiketten“ kannst du für die Handlager-Karte einen Zugangs-Code " +
        "wählen. Wer sie dann scannt, landet ohne Anmeldung direkt beim Entnehmen. Ohne Wahl " +
        "trägt die Karte wie bisher ihre Adresse, und ein Scan verlangt eine Anmeldung.",
    ),
    hinweis(
      "Der Code steht danach lesbar auf der Karte am Regal. Wer sie abfotografiert, kommt " +
        "damit genauso hinein — sperre ihn unter „Verwaltung → Zugangs-Codes“, wenn die Karte " +
        "nicht mehr dort hängt.",
    ),
  ],
};

export default notiz;
