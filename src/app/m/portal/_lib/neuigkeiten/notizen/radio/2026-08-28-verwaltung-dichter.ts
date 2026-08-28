// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "verwaltung-dichter",
  datum: "2026-08-28",
  titel: "Die Verwaltung ist wieder kompakt",
  inhalt: [
    absatz(
      "Die Verwaltungsseiten sind enger gesetzt: das Suchfeld und die Knöpfe sind niedriger als " +
        "bisher. Auf einen Bildschirm passt dadurch mehr, und du scrollst in den langen Listen " +
        "weniger. Das ist wieder das Maß, das die alte Funk-Anwendung hatte.",
    ),
    absatz(
      "Dazu tragen die Knöpfe wieder ihre Zeichen. Unter „Geräte“ stehen sie an „Filter“, " +
        "„Exportieren“ und „Gerät anlegen“, unter „Softwareversionen“ an „Nach oben“, " +
        "„Nach unten“, „Als Ziel“ und „Löschen“. Die Beschriftung bleibt daneben stehen — das " +
        "Zeichen kommt dazu und ersetzt kein Wort.",
    ),
    absatz(
      "Am Ausleihen ändert sich nichts. Die Flächen, die du am Gerät oder über einen QR-Code " +
        "aufrufst, bleiben so groß wie bisher: sie werden im Stehen und oft mit Handschuhen " +
        "bedient, und dafür ist die größere Fläche richtig.",
    ),
    absatz(
      "Unverändert bleiben auch die Kopfzeile und die Leiste mit Übersicht, Geräte, Ausleihen, " +
        "Update-Modus, Import, Softwareversionen und Zugänge. Was wo steht, bleibt, wo es war — " +
        "es steht nur dichter beieinander.",
    ),
  ],
};

export default notiz;
