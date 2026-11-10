// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "umfrage-starten",
  datum: "2026-11-10",
  titel: "Feedback freigeben heißt jetzt Umfrage starten",
  inhalt: [
    absatz(
      "Unter Kommende Abende heißt der Knopf Feedback freigeben jetzt Umfrage starten, wie überall sonst im Feedback; zum Schluss klickst du auf Umfrage beenden. Liegt ein Abend noch in der Zukunft, steht in seiner Zeile, ab welchem Tag du die Umfrage starten kannst.",
    ),
  ],
};

export default notiz;
