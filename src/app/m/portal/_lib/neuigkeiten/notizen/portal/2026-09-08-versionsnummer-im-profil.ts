// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "versionsnummer-im-profil",
  datum: "2026-09-08",
  titel: "Die Suite nennt ihre Versionsnummer",
  inhalt: [
    absatz(
      "Auf der Profilseite steht jetzt die Versionsnummer des Standes, der gerade läuft, zum " +
        "Beispiel 1.4.2. Nenne sie, wenn du etwas meldest — dann ist klar, ob eine Änderung bei " +
        "dir schon angekommen ist.",
    ),
  ],
};

export default notiz;
