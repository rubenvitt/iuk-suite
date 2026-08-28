// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "funk-in-der-suite",
  datum: "2026-08-28",
  titel: "Ausleihe und Verwaltung der Funkgeräte sind in der Suite angekommen",
  inhalt: [
    absatz(
      "Bisher waren die Funkgeräte zwei getrennte Anwendungen: eine für das Ausleihen am Gerät " +
        "und eine für die Verwaltung. Beide sind jetzt eine App in der Suite. Sie heißt " +
        "„Funkgeräte“ und steht in der Kachelliste neben den anderen Apps. Geräte, Ausleihen, " +
        "Softwareversionen und Zugangscodes sind vollständig übernommen — du fängst nicht bei " +
        "null an.",
    ),
    absatz(
      "Am Ausleihen ändert sich nichts. Du scannst den QR-Code am Gerät oder öffnest die Kachel, " +
        "und die Flächen bleiben so groß wie bisher, weil sie im Stehen und oft mit Handschuhen " +
        "bedient werden. Die aufgeklebten QR-Codes gelten weiter.",
    ),
    absatz(
      "In die Verwaltung kommst du über „Zur Verwaltung“ in der Ausleihe. Dort steht die Leiste " +
        "mit Übersicht, Geräte, Ausleihen, Update-Modus, Import, Softwareversionen und Zugänge, " +
        "so wie du sie kennst. Du meldest dich mit demselben Konto an wie in den anderen Apps der " +
        "Suite; wer schon in einer davon angemeldet ist, ist es hier auch.",
    ),
    absatz(
      "Adressen und Lesezeichen bleiben. Die Adresse der Ausleihe ist unverändert, und die " +
        "bisherige Adresse der Verwaltung leitet auf die neue Verwaltungsseite weiter.",
    ),
  ],
};

export default notiz;
