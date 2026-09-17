// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT: etwas GEHT, das vorher nicht ging. Bis hierher
 * war die Chargenliste am Artikel reine Auskunft; gebucht wurde immer die
 * zuerst ablaufende. Wer eine hintere Packung nahm, erzeugte einen Bestand, der
 * auf dem Papier anders aussah als im Fach — und merkte es nie.
 *
 * ⚠️ EIN ABSATZ, KEIN ZWEITER. Der zweite Wurf hatte einen Satz zum
 * Mengenfeld („die Menge passt sich der Charge an"); er beschreibt eine
 * Selbstverständlichkeit, die man beim ersten Antippen sieht, und CLAUDE.md
 * nennt genau das als das, was zuerst wegfällt — die Aufzählung der
 * Nebenwirkungen.
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun: wer nichts wählt, bucht wie bisher. Ein Hinweis ohne Handlung ist eine
 * Auskunft an der falschen Stelle.
 *
 * ⚠️ DER ERSTE SATZ SAGT, WAS JETZT GEHT, und der zweite, dass sich für den
 * Normalfall nichts ändert. Die zweite Hälfte ist nicht Beruhigung um ihrer
 * selbst willen: „du kannst jetzt wählen" liest sich sonst wie „du musst jetzt
 * wählen", und das wäre am Regal eine schlechte Nachricht.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "charge-waehlen",
  datum: "2026-09-17",
  titel: "Beim Entnehmen die Charge wählen",
  inhalt: [
    absatz(
      "Hältst du nicht die vorderste Packung in der Hand, wählst du beim Entnehmen jetzt " +
        "die Charge aus, die du wirklich nimmst. Ohne Auswahl bucht das Lagerbuch weiter " +
        "die zuerst ablaufende — für den Normalfall ändert sich also nichts.",
    ),
  ],
};

export default notiz;
