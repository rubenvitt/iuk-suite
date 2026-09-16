// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Eine Notiz im Portal statt drei in den Apps: die Umstellung gilt für alle
// Berichte gleichermaßen — dasselbe Muster wie „tabellen-sortieren-filtern".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "berichte-als-excel",
  datum: "2026-09-16",
  titel: "Berichte kommen als Excel-Datei",
  inhalt: [
    absatz(
      "Die Knöpfe, die bisher „CSV“ hießen, heißen jetzt „Excel“ und liefern eine " +
        "xlsx-Datei: die Teilnehmerlisten und Auswertungen im Drohnentraining, die " +
        "Abend-Auswertungen im Feedback und der Bestellvorschlag im Lagerbuch. Du öffnest " +
        "sie mit einem Doppelklick, ohne Nachfrage nach Trennzeichen und Zeichensatz.",
    ),
    absatz(
      "Zahlen sind darin auch Zahlen, du kannst also direkt summieren, sortieren und ein " +
        "Diagramm daraus machen. Angaben wie Gruppe, Thema oder Teilnehmername stehen auf " +
        "einem zweiten Blatt, damit die Tabelle mit der Überschriftenzeile beginnt.",
    ),
  ],
};

export default notiz;
