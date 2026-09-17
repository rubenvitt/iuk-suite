// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ EIN NAME ÄNDERT SICH, UND ETWAS VERSCHWINDET — zwei der Zeilen, bei denen
 * die Tabelle in CLAUDE.md „Notiz" sagt. Wer die Kärtchen-Karten auf dem
 * Etikettenbogen sucht, findet sie sonst nicht mehr und weiß nicht, wohin sie
 * gegangen sind.
 *
 * ⚠️ EIN ABSATZ REICHT. Die Änderung hat keine Vorgeschichte, die jemand
 * braucht, und keinen Handgriff, den jemand tun muss — der Hinweis steht in der
 * Notiz daneben, wo er hingehört.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "artikeletiketten",
  datum: "2026-09-17",
  titel: "Etiketten heißen jetzt Artikeletiketten",
  inhalt: [
    absatz(
      "„Verwaltung → Artikeletiketten“ druckt nur noch die Klebeetiketten für die " +
        "Regalfächer. Die Kärtchen mit den Zugangs-Codes stehen dort nicht mehr — jeder " +
        "Code gehört jetzt zu einem Ort und steht auf dessen Karte unter „Ortsetiketten“.",
    ),
  ],
};

export default notiz;
