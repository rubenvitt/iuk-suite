// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung selbst — diese Notiz beschreibt ihre eigene Arbeitsfläche.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "verwaltung-auf-dem-telefon",
  datum: "2026-08-29",
  titel: "Die Verwaltung sieht aus wie der Rest der Suite",
  inhalt: [
    absatz(
      "Die Verwaltung trägt jetzt dieselbe Seitenleiste wie die übrigen Apps: jeder Eintrag hat " +
        "ein Zeichen, und „Trainingsansicht“ steht unter einer eigenen Überschrift getrennt von " +
        "„Teilnehmer“ und „Aufgabenkatalog“ — sie führt aus der Verwaltung heraus in die Ansicht, " +
        "die die Trainierenden auf ihrem Telefon sehen. Jede der drei Seiten sagt oben in einem " +
        "Satz, wofür sie da ist.",
    ),
    absatz(
      "Der Aufgabenkatalog lief auf dem Telefon über den Bildschirmrand hinaus, und die Spalten " +
        "rechts waren nicht erreichbar. Jetzt wird die Tabelle in sich seitwärts geschoben, die " +
        "Seite selbst bleibt stehen. Felder und Knöpfe der Formulare stehen auf dem Telefon " +
        "untereinander über die volle Breite statt in halben Zeilen nebeneinander.",
    ),
    absatz(
      "„Beginn“ ist ein Kalenderfeld in deutscher Schreibweise, also 05.01.2026 statt " +
        "mm/dd/yyyy. Auf der Detailseite eines Teilnehmers führt ein Rückweg „Teilnehmer“ zur " +
        "Liste zurück, an derselben Stelle wie in den anderen Apps. Die Namen in der " +
        "Teilnehmerliste sind nicht mehr rot — Rot trägt in der Suite eine Bedeutung, und ein " +
        "Name ist keine Warnung.",
    ),
    absatz(
      "Die beiden CSV-Ausgaben heißen jetzt „Liste als CSV“ in der Übersicht und „Auswertung als " +
        "CSV“ auf der Detailseite. Vorher standen dort „CSV“ und „Detail-CSV“. Inhalt und Aufbau " +
        "der Dateien bleiben unverändert, ebenso alle Wege und alle Daten.",
    ),
  ],
};

export default notiz;
