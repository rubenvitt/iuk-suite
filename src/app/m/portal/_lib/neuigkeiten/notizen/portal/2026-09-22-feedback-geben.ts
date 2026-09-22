// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT: hier geht etwas, das vorher nicht ging — es gab
 * schlicht keinen Weg, uns aus der Suite heraus etwas zu sagen. Das ist die
 * erste Zeile der Tabelle in `CLAUDE.md` und der unstrittigste Fall überhaupt.
 *
 * ⚠️ `modul: "portal"`, obwohl der Weg in JEDER App steht. Je Modul eine Notiz
 * ergäbe sechsmal denselben Satz und kostete genau die Glaubwürdigkeit, die die
 * Liste kurz hält. Vorbild sind „Tabellen sortieren und filtern in der Spalte"
 * (14.09.) und „Listen auf dem Telefon als Karten" (21.09.), die dieselbe
 * Entscheidung für app-übergreifende Änderungen getroffen haben.
 *
 * ⚠️ DER ZWEITE ABSATZ IST KEIN NACHKLAPP. Ein Knopf, der über dem Inhalt
 * schwebt und dann verschwindet, sieht ohne diesen Satz nach einem Fehler aus —
 * und wer ihn weggeklickt hat und ihn später sucht, findet in derselben Zeile,
 * wo der Weg stattdessen steht.
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun: wer nichts zu sagen hat, klickt den Knopf weg und ist fertig.
 *
 * ⚠️ WAS DRAUSSEN BLEIBT: dass das Formular auf unserem Ticketboard landet
 * (wohin eine Meldung intern läuft, ist keine Auskunft für den Meldenden), dass
 * der Knopf sich je Gerät merkt, wo er weggeklickt wurde, und dass die
 * bisherige Umfragen-Einbindung dafür weggefallen ist — von der hat nie jemand
 * eine Umfrage gesehen.
 */
const notiz: Releasenotiz = {
  modul: "portal",
  slug: "feedback-geben",
  datum: "2026-09-22",
  titel: "Feedback geben, aus jeder App heraus",
  inhalt: [
    absatz(
      "Im Menü hinter deinem Namen steht jetzt „Feedback geben“. Dahinter liegt ein Formular, " +
        "in dem du aufschreiben kannst, was nicht klappt, fehlt oder besser ginge. Es öffnet " +
        "sich in einem neuen Tab, deine Arbeit bleibt also stehen.",
    ),
    absatz(
      "Auf der Startseite findest du denselben Weg als Kachel unter „Rückmeldung“. Unten rechts " +
        "steht zusätzlich ein kleiner Knopf — hast du ihn einmal benutzt oder mit dem Kreuz " +
        "daneben weggeklickt, kommt er nicht wieder.",
    ),
  ],
};

export default notiz;
