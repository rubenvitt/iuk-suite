// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// `datum` ist der Tag des ROLLOUTS. Wird er verschoben, wandern Dateiname UND Feld
// gemeinsam — `register.test.ts` hält beides zusammen.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "eigene-zeichen-bauen",
  datum: "2026-09-02",
  titel: "Eigene Zeichen zusammenstellen und herunterladen",
  inhalt: [
    absatz(
      "Unter „Baukasten“ stellst du jetzt ein taktisches Zeichen selbst zusammen: Grundzeichenart, " +
        "Zugehörigkeit, Kopfzone, Funktion, Körperform, Fähigkeit, Körpermarken und Beschriftung. " +
        "Die Vorschau zeichnet bei jeder Auswahl mit.",
    ),
    absatz(
      "Was in einer Zusammenstellung nicht vorkommt, lässt sich gar nicht erst auswählen — es steht " +
        "grau in der Liste, und daneben steht, warum. Eine Stärke gibt es zum Beispiel nur an " +
        "Formationen und Personen, und über dem Körper ist nur für eines von dreien Platz.",
    ),
    absatz(
      "Fertige Zeichen lädst du als SVG oder als PNG herunter, oder du speicherst sie unter „Meine " +
        "Zeichen“. Speicherst du zweimal denselben Namen, fragt die App nach, statt zu " +
        "überschreiben. Hast du dieselbe Zusammenstellung schon einmal gesichert, sagt sie dir, " +
        "unter welchem Namen.",
    ),
    absatz(
      "Zum Üben gibt es im Baukasten den Knopf „Übungsaufgabe ziehen“: du bekommst die Bedeutung " +
        "eines Zeichens und baust es nach. Beim Prüfen steht da, was schon stimmt und was noch " +
        "fehlt. Diese Übung zählt nicht zum Lernstand — der Katalog und deine Merkliste bleiben " +
        "unverändert.",
    ),
  ],
};

export default notiz;
