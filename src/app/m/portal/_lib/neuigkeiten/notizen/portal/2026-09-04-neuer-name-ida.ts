// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Die Notiz vom 16.08. („neuer-name-sammelhaus") bleibt stehen und wird NICHT
// umgeschrieben: der Kopf von `portal/neuigkeiten/page.tsx` verspricht „in der
// Reihenfolge, in der es passiert ist", und ein Protokoll, aus dem rückwirkend
// Einträge verschwinden, ist keines. Zwei Namenswechsel sind hier zwei Notizen.
// Kein `hinweis`, weil nichts zu tun ist. Die I&K-Erklärung stand in der alten
// Notiz als `hinweis` und steht hier als Absatz — sie ist eine Auskunft, keine
// Aufforderung.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "neuer-name-ida",
  datum: "2026-09-04",
  titel: "Die Suite heißt jetzt IDA",
  inhalt: [
    absatz(
      "Auf allen Köpfen der Seiten steht jetzt „IDA“, wo bis gestern „Sammelhaus“ stand. IDA " +
        "steht für „Interne Dienste und Anwendungen“ — es ist derselbe Zugang zu denselben Apps " +
        "unter einem anderen Wort.",
    ),
    absatz(
      "Adressen, Lesezeichen, Anmeldung und Daten bleiben, wie sie waren. Ein Lesezeichen, das " +
        "gestern funktioniert hat, funktioniert heute; deine Anmeldung gilt weiter, und was du " +
        "in den Apps abgelegt hast, findest du an derselben Stelle wieder. Aushänge, die schon " +
        "an der Wand hängen, tragen weiter den alten Namen — die Codes darauf gelten unverändert.",
    ),
    absatz(
      "Das ist der zweite Namenswechsel innerhalb von vier Wochen. „Sammelhaus“ war ein Bild " +
        "dafür, dass alles an einem Ort liegt; es benannte aber nicht, was hier liegt. Der " +
        "Wechsel kommt so früh, weil ein Name umso teurer wird, je länger er steht.",
    ),
    absatz(
      "Wo dir weiterhin „I&K“ begegnet — etwa in „Bitte beim I&K melden“ —, ist das kein " +
        "übersehener Rest: die Plattform heißt IDA, der Fachdienst, der sie betreibt, weiter I&K.",
    ),
  ],
};

export default notiz;
