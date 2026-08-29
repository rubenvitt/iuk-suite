// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe wie bei der Umzugsnotiz vom selben Tag: die Verwaltung
// (switcherGroupSources: ["admin"] in core/registry.ts). Sie ist es, die die
// Rückfrage „warum fehlen die Bilder?" aus dem Training bekommt — geschrieben
// ist die Notiz deshalb an sie, nicht an die Trainierenden.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "bilder-in-den-uebungsaufgaben",
  datum: "2026-08-29",
  titel: "Die Bilder in den Übungsaufgaben sind wieder da",
  inhalt: [
    absatz(
      "Seit dem Umzug in die Suite blieb in jeder Übungsaufgabe die Fläche über der Beschreibung " +
        "leer, auf manchen Geräten mit einem kaputten Bildsymbol darin. Die Illustrationen sind " +
        "jetzt wieder zu sehen — in „Schwebeflug“ ebenso wie in allen anderen Aufgaben.",
    ),
    absatz(
      "Die Bilder stehen nicht im Aufgabentext, sondern liegen als eigene Dateien daneben. Beim " +
        "Umzug sind alle Aufgaben mitgekommen, von den Bildern aber nur ihre Platzhalter. Deshalb " +
        "war der Text jeder Aufgabe vollständig und nur das Bild nicht.",
    ),
    absatz(
      "An den Aufgaben selbst ändert sich nichts: dieselben Schritte, dieselben Durchführungs- " +
        "und Sicherheitshinweise, dieselbe Zielanzahl. Erfasste Durchführungen und der Fortschritt " +
        "waren davon zu keinem Zeitpunkt berührt.",
    ),
    absatz(
      "Wer eine Aufgabe schon offen hatte, sieht das Bild beim nächsten Öffnen der Seite. Die App " +
        "zurückzusetzen oder einen neuen Magic-Link zu verschicken ist dafür nicht nötig.",
    ),
  ],
};

export default notiz;
