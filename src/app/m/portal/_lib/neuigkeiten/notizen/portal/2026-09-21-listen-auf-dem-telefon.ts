// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT — und wieder ist die naheliegende Begründung die
 * falsche. „Die Tabellen sehen auf dem Telefon aufgeräumter aus" wäre KEIN
 * Grund (CLAUDE.md führt „eine Fläche sieht aufgeräumter aus als gestern"
 * rechts). Die Probe trifft aus zwei anderen: auf dem Telefon GEHT jetzt
 * etwas, das vorher praktisch nicht ging, und wer die Tabelle dort gewohnt war,
 * SUCHT sie — samt der Spaltenüberschriften, über die er bisher gefiltert hat.
 *
 * ⚠️ EINE NOTIZ, NICHT SECHS. Betroffen sind rund vierzig Tabellen in Lager,
 * Funk, Dateien, Aufgaben, Rückmeldungen und der Verwaltung. Je Modul eine
 * Notiz zu schreiben ergäbe sechsmal denselben Satz und kostete genau die
 * Glaubwürdigkeit, die die Liste kurz hält. `modul: "portal"` ist dafür der
 * vorgesehene Ort — Vorbild ist die Notiz „Tabellen sortieren und filtern in
 * der Spalte" vom 14.09., die dieselbe Änderung für alle Apps beschrieb.
 *
 * ⚠️ DER ZWEITE ABSATZ IST DER WICHTIGE, auch wenn der erste die Änderung
 * nennt. Die Spaltenüberschriften sind der Ort, an dem seit dem 14.09. jeder
 * Filter sitzt; auf einer Karte gibt es sie nicht. Ohne den Satz wäre die
 * Notiz die Ankündigung eines Verlusts.
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun — die Ansicht wechselt von allein mit der Breite des Geräts.
 *
 * ⚠️ WAS DRAUSSEN BLEIBT: dass es vorher schon zwei Apps mit Karten gab, dass
 * die Inventur das Vorbild war, und jede Zahl zur Anzahl der Tabellen. Das ist
 * Vorgeschichte und Begründung — beides fällt nach der Stilregel als Erstes
 * weg.
 */
const notiz: Releasenotiz = {
  modul: "portal",
  slug: "listen-auf-dem-telefon",
  datum: "2026-09-21",
  titel: "Listen auf dem Telefon als Karten",
  inhalt: [
    absatz(
      "Auf dem Telefon zeigen die Listen in allen Apps jetzt je Eintrag eine Karte statt " +
        "einer Tabelle, die man seitwärts schieben muss. Was einen Eintrag ausmacht, steht " +
        "untereinander im Bild; Knöpfe wie „Bearbeiten“ oder „Löschen“ stehen über die " +
        "volle Breite darunter.",
    ),
    absatz(
      "Sortieren und Filtern findest du dort über der Liste statt in den " +
        "Spaltenüberschriften — die gibt es auf einer Karte nicht. Ist ein Filter gesetzt, " +
        "steht daneben, wie viele Einträge von wie vielen gerade zu sehen sind.",
    ),
    absatz("Am Rechner bleibt die gewohnte Tabelle."),
  ],
};

export default notiz;
