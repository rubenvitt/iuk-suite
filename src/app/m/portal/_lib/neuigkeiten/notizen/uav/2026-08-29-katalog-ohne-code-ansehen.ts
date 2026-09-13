// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (siehe „drohnentraining-in-der-suite" daneben).
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "katalog-ohne-code-ansehen",
  datum: "2026-08-29",
  titel: "Der Aufgabenkatalog ist ohne Code lesbar",
  inhalt: [
    absatz(
      "Wer die Adresse des Trainings aufruft, sieht jetzt sofort alle aktiven Aufgaben mit " +
        "Beschreibung, Schritten und Hinweisen; vorher stand dort ein Sperrbildschirm. Zum " +
        "Eintragen einer Durchführung braucht es weiterhin den persönlichen Code.",
    ),
    absatz("Namen, Codes, Fortschritt und Auswertungen bleiben geschlossen."),
    hinweis(
      "Sieh den Katalog daraufhin durch, ob dort etwas steht, das nicht öffentlich lesbar sein " +
        "soll — das setzt du in Verwaltung → Aufgabenkatalog auf inaktiv.",
    ),
  ],
};

export default notiz;
