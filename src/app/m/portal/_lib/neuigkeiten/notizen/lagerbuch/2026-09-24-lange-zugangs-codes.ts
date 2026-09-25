// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT: die Karten sehen anders aus, das Eingabefeld
 * nimmt Buchstaben, und es gibt einen neuen Knopf, nach dem sonst niemand sucht.
 *
 * ⚠️ DER `hinweis` IST EINE AUFFORDERUNG: wer „Alte Codes neu erzeugen" drückt
 * und nicht druckt, hat ab dem Klick Karten am Fahrzeug, die ins Leere führen.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "lange-zugangs-codes",
  datum: "2026-09-24",
  titel: "Neue Zugangs-Codes haben 28 Zeichen",
  inhalt: [
    absatz(
      "Jeder neu erzeugte Zugangs-Code hat jetzt 28 Zeichen statt sechs Ziffern. Damit kommst " +
        "du auch dann herein, wenn gerade jemand viele falsche Codes ausprobiert. Beim Eintippen " +
        "sind Groß- und Kleinschreibung und Bindestriche egal.",
    ),
    absatz(
      "Deine Karten mit sechs Ziffern gelten weiter. Unter „Verwaltung → Ortsetiketten“ siehst " +
        "du, wie viele noch einen alten Code tragen, und erzeugst mit „Alte Codes neu erzeugen“ " +
        "für alle auf einmal neue.",
    ),
    hinweis(
      "Danach gelten die alten Karten nicht mehr. Drucke die Ortsetiketten gleich neu und " +
        "tausche die Karten aus.",
    ),
  ],
};

export default notiz;
