// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT, obwohl die meisten Änderungen keine bekommen —
 * und warum die naheliegende Begründung die FALSCHE wäre. „Die Inventur ist
 * schneller geworden" ist ausdrücklich KEIN Grund (die Tabelle in CLAUDE.md
 * führt „etwas ist schneller oder stabiler geworden" in der rechten Spalte).
 * Die Probe trifft aus einem anderen Grund, und zwar zweimal: auf dem Telefon
 * GEHT jetzt etwas, das vorher praktisch nicht ging, und wer die Inventur dort
 * kennt, findet die Tabelle nicht mehr, die er gewohnt ist — er SUCHT also
 * etwas.
 *
 * ⚠️ DIE ZAHLEN BLEIBEN DRAUSSEN. Wie viele Millisekunden ein Klick vorher
 * kostete, ist die Begründung der Änderung, nicht ihre Wirkung für den Leser;
 * „flüssiger" wäre dazu noch ein Werbewort. Was zählt, ist der eine Satz: du
 * kannst am Schrank stehen und zählen.
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun — die Ansicht wechselt von allein mit dem Gerät.
 *
 * ⚠️ HIER STAND EIN SATZ ZU VIEL, und er war falsch: „wechselst du das Gerät,
 * steht dein Stand da, wo du ihn gelassen hast". Der Zählstand lebt in der
 * geöffneten Seite, nicht im Konto — wer am Telefon zählt und am Rechner
 * weitermachen will, fängt von vorn an. Eine Zusage, die die Software nicht
 * einlöst, ist in einer Anwendernotiz teurer als eine fehlende Auskunft.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-telefon",
  datum: "2026-09-18",
  titel: "Inventur am Schrank mit dem Telefon",
  inhalt: [
    absatz(
      "Die Inventur zeigt auf dem Telefon jetzt je Artikel eine Karte statt einer Tabelle, " +
        "die man seitwärts schieben muss. Name, erwartete Menge und die Knöpfe zum Zählen " +
        "stehen untereinander im Bild. Über der Liste kannst du nach Kategorie und Fach " +
        "filtern, damit du nur das vor dir hast, was im Schrank liegt.",
    ),
    absatz("Am Rechner bleibt die gewohnte Tabelle."),
  ],
};

export default notiz;
