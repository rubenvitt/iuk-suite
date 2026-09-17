// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT, obwohl die meisten Änderungen keine bekommen:
 * ein WEG ändert sich („Neuen Code anlegen" gibt es nicht mehr), und der Scan
 * einer Ortskarte tut ab jetzt etwas anderes als vorher.
 *
 * ⚠️ DIE UMBENENNUNG DER ETIKETTEN STEHT IN EINER ZWEITEN NOTIZ, und das ist
 * nicht Geschmack: der erste Wurf hatte beides zusammen und riss die Grenzen
 * aus `NOTIZ_GRENZEN` (4 Blöcke, 856 Zeichen). CLAUDE.md sagt für genau diesen
 * Fall, was zu tun ist — „wer an eine Grenze stößt, hat fast nie eine zu lange
 * Notiz, sondern zwei Änderungen in einer Datei; dann sind es zwei Notizen".
 *
 * ⚠️ EIN `hinweis`, UND ER IST EINE AUFFORDERUNG, KEINE AUSKUNFT. Wer die
 * Ortsetiketten nicht einmal öffnet, hat Karten ohne Code am Fahrzeug hängen.
 *
 * ⚠️ DER ERSTE ABSATZ NENNT ZWEI LANDUNGEN, NICHT EINE — gefunden in der
 * Durchsicht. „Führt direkt zum Entnehmen" stimmte nur für den Handlager: eine
 * Einheit trägt `ziel_typ = "fahrzeug"`, und `tokenZielPfad` öffnet dafür
 * `/helfer/check`. Für die MEISTEN Karten stand also die falsche Seite da —
 * und wer die richtige bekommt, hält seine Karte für kaputt.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "ortscodes",
  datum: "2026-09-17",
  titel: "Jede Ortskarte hat ihren eigenen Zugangs-Code",
  inhalt: [
    absatz(
      "Der Handlager, jedes Fahrzeug und jede Tasche haben jetzt genau einen Zugangs-Code. " +
        "Er steht als QR auf der Karte unter „Verwaltung → Ortsetiketten“ und öffnet ohne " +
        "Anmeldung die passende Seite: am Regal das Entnehmen, am Fahrzeug und an der Tasche " +
        "deren Check. Mit dem Regal-Code gibt es nur das Entnehmen.",
    ),
    absatz(
      "Codes legst du nicht mehr von Hand an. Wird einer missbraucht, erzeuge ihn unter " +
        "„Verwaltung → Zugangs-Codes“ neu — der bisherige ist dann dauerhaft gesperrt. " +
        "Deine bisherigen Kärtchen bleiben gültig.",
    ),
    hinweis(
      "Öffne einmal „Verwaltung → Ortsetiketten“ und drucke die Karten neu — vorher trägt " +
        "keine Karte einen Code.",
    ),
  ],
};

export default notiz;
