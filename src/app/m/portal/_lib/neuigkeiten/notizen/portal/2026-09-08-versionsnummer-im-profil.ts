// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "versionsnummer-im-profil",
  datum: "2026-09-08",
  titel: "Die Suite nennt ihre Versionsnummer",
  inhalt: [
    absatz(
      "Auf der Profilseite steht jetzt ein Kasten „Diese Suite“ mit der Versionsnummer des " +
        "Standes, der gerade läuft, zum Beispiel 1.4.2. Du erreichst die Seite aus jeder App " +
        "über das Nutzermenü oben rechts und dann „Profil“.",
    ),
    absatz(
      "Die Nummer hilft, wenn du etwas meldest: Sag dazu, welche Version du siehst, dann ist " +
        "klar, ob eine Änderung bei dir schon angekommen ist oder ob ein Fehler in einem " +
        "älteren Stand steckt. Bisher gab es dafür nur eine lange Zeichenfolge, die niemand " +
        "abtippen wollte.",
    ),
    absatz(
      "Die Nummer wächst mit jeder Änderung, die ausgeliefert wird. Eine neue Fähigkeit " +
        "erhöht die mittlere Stelle, eine Korrektur die letzte. Was sich jeweils geändert hat, " +
        "steht weiterhin hier unter Neuigkeiten, nicht hinter der Nummer.",
    ),
    absatz(
      "An der Anmeldung, an deinen Gruppen und an den Apps ändert sich nichts. Der Kasten " +
        "ist eine Auskunft, kein Knopf.",
    ),
  ],
};

export default notiz;
