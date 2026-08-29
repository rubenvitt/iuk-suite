// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (siehe die Notiz „katalog-ohne-code-ansehen" daneben).
// Diese Notiz beschreibt eine Änderung, die die Trainierenden sehen — geschrieben für
// die Person, die deren Rückfragen beantwortet.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "trainingsansicht-ohne-suite-leiste",
  datum: "2026-08-29",
  titel: "Die Trainingsansicht läuft ohne die Leiste der Suite",
  inhalt: [
    absatz(
      "Über der Trainingsansicht stand bisher dieselbe Kopfzeile wie über den anderen Apps, mit " +
        "Umschalter und Menü. Sie ist weg. Oben stehen jetzt nur noch der Name der App und rechts " +
        "ein kleiner Weg in die Verwaltung. Auf dem Telefon bleibt dadurch spürbar mehr Platz für " +
        "das, worum es geht: bei 390 Pixel Bildbreite stehen dem Text 358 statt 326 Pixel zur " +
        "Verfügung.",
    ),
    absatz(
      "Auf schmalen Geräten ließ sich die Seite bisher seitwärts schieben, weil etwas über den " +
        "rechten Rand hinausragte. Das ist behoben. Da sich die Ansicht nicht heranzoomen lässt, " +
        "war alles, was über den Rand ragte, vorher schlicht nicht erreichbar.",
    ),
    absatz(
      "Die Anzeige „Synchronisiert“ steht nicht mehr dauerhaft am unteren Bildrand und verdeckt " +
        "beim Scrollen keine Einträge mehr. Zu sehen sind nur noch „Offline“ und „Sync " +
        "fehlgeschlagen“ — und nach einer Störung einmal kurz die Bestätigung, dass alles " +
        "übertragen ist. Ein Abschnitt ohne Aufgaben steht außerdem nicht mehr als Überschrift " +
        "über dem Nichts, und wenn eine Abbildung nicht lädt, steht dort eine ruhige Fläche mit " +
        "einem Satz statt eines langen Ersatztextes mitten im Absatz.",
    ),
    absatz(
      "Mit der Kopfzeile entfällt für die Trainierenden auch der Umschalter zwischen heller und " +
        "dunkler Darstellung. Die Ansicht folgt jetzt der Einstellung des Geräts. Am Zugang ändert " +
        "sich nichts: der Code gilt weiter, ein Magic-Link öffnet die Übersicht wie bisher, der " +
        "Fortschritt ist unverändert da, und offline erfasste Durchführungen werden nachgetragen " +
        "wie zuvor.",
    ),
  ],
};

export default notiz;
