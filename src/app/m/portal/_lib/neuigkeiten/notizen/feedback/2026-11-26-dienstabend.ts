// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Eine Namensänderung: ohne diese Notiz sucht jemand im App-Umschalter vergeblich nach „Feedback".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "dienstabend",
  datum: "2026-11-26",
  titel: "Feedback heißt jetzt Dienstabend",
  inhalt: [
    absatz(
      "Die App Feedback heißt jetzt Dienstabend, weil darin neben der Umfrage auch das Quiz liegt. Du findest sie unter Alle Apps beim Namen Dienstabend; der Rückmeldebogen heißt weiter Feedback, und Umfrage starten bleibt, wo es war.",
    ),
  ],
};

export default notiz;
