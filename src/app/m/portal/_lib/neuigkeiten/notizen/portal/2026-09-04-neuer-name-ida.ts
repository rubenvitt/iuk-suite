// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Die Notiz vom 16.08. („neuer-name-sammelhaus") bleibt stehen und wird NICHT
// gelöscht: der Kopf von `portal/neuigkeiten/page.tsx` verspricht „in der
// Reihenfolge, in der es passiert ist", und ein Protokoll, aus dem rückwirkend
// Einträge verschwinden, ist keines. Zwei Namenswechsel sind hier zwei Notizen.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "neuer-name-ida",
  datum: "2026-09-04",
  titel: "Die Suite heißt jetzt IDA",
  inhalt: [
    absatz(
      "Auf allen Köpfen der Seiten steht jetzt „IDA“ — „Interne Dienste und Anwendungen“ —, wo " +
        "bis gestern „Sammelhaus“ stand. Adressen, Lesezeichen, Anmeldung und Daten bleiben, wie " +
        "sie waren; Aushänge mit dem alten Namen gelten weiter.",
    ),
    absatz(
      "Wo dir „I&K“ begegnet, ist das kein übersehener Rest: die Plattform heißt IDA, der " +
        "Fachdienst, der sie betreibt, weiter I&K.",
    ),
  ],
};

export default notiz;
