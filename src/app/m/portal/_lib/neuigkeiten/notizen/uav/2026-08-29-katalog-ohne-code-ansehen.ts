// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe wie bei den übrigen uav-Notizen: die Verwaltung (switcherGroupSources:
// ["admin"] in core/registry.ts — die Kachel und damit diese Notiz sieht nur, wer die
// Verwaltungsgruppe hat). Deshalb an die Person geschrieben, die Fragen aus dem
// Training beantwortet, nicht an die Trainierenden selbst.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "katalog-ohne-code-ansehen",
  datum: "2026-08-29",
  titel: "Der Aufgabenkatalog lässt sich ohne Code ansehen",
  inhalt: [
    absatz(
      "Wer die Adresse des Trainings aufruft, sieht jetzt sofort alle Aufgaben — Übersicht, " +
        "Beschreibung, Schritte, Lernziel, Durchführungs- und Sicherheitshinweise. Vorher stand " +
        "dort ein Sperrbildschirm mit der Aufforderung, einen Code einzugeben. Auf einem geteilten " +
        "Tablet kann damit jemand nachschlagen, was in einer Übung zu tun ist, ohne sich vorher " +
        "anzumelden.",
    ),
    absatz(
      "Zum Eintragen einer Durchführung braucht es weiterhin den persönlichen Code. Ohne ihn " +
        "fehlen die Fortschrittskarte, der Zähler an jeder Aufgabe, die Zielanzahl, der Schalter " +
        "„nicht anwendbar“, die Liste der bisherigen Durchführungen und das Erfassungsformular. " +
        "An ihrer Stelle steht ein Satz, woher ein Code kommt.",
    ),
    absatz(
      "Für dich als Verwaltung heißt das: die Trainingsinhalte sind ab jetzt für jeden lesbar, " +
        "der die Adresse kennt. Namen, Codes, Fortschritt und Auswertungen bleiben unverändert " +
        "geschlossen — daran ändert sich nichts. Sichtbar sind außerdem nur die Aufgaben, die auf " +
        "aktiv stehen; eine deaktivierte Aufgabe taucht auch auf diesem Weg nicht auf.",
    ),
    absatz(
      "Ein geteiltes Tablet, das die App noch nie mit Netzverbindung geöffnet hat, zeigt ohne " +
        "Code zunächst nichts. Der Katalog wird beim ersten Öffnen mit Netz geladen und steht " +
        "danach zur Verfügung.",
    ),
    hinweis(
      "Sieh den Katalog einmal daraufhin durch, ob dort etwas steht, das nicht öffentlich " +
        "lesbar sein soll. Was du nicht zeigen willst, setzt du in Verwaltung → Aufgabenkatalog " +
        "auf inaktiv.",
    ),
  ],
};

export default notiz;
