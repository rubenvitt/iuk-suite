// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// `datum` ist der Tag des ROLLOUTS. Wird er verschoben, wandern Dateiname UND Feld
// gemeinsam — `register.test.ts` hält beides zusammen.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "eigene-zeichen-bauen",
  datum: "2026-09-02",
  titel: "Eigene Zeichen zusammenstellen",
  inhalt: [
    absatz(
      "Unter „Baukasten“ stellst du ein taktisches Zeichen selbst zusammen, und die Vorschau " +
        "zeichnet bei jeder Auswahl mit. Was in einer Zusammenstellung nicht vorkommt, steht " +
        "grau in der Liste, mit dem Grund daneben.",
    ),
    absatz(
      "Fertige Zeichen lädst du als SVG oder PNG herunter oder speicherst sie unter „Meine " +
        "Zeichen“.",
    ),
  ],
};

export default notiz;
