// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "letzter-check-und-verfall-loeschen",
  datum: "2026-09-15",
  titel: "Der Fahrzeug-Check zeigt, wann zuletzt geprüft wurde",
  inhalt: [
    absatz(
      "Über der Liste steht jetzt, wann dieses Fahrzeug zuletzt geprüft wurde — oder dass es " +
        "der erste Check ist. Ein eingetragenes Verfallsdatum kannst du im Schritt „Zählen“ " +
        "über das Kreuz neben dem Feld wieder entfernen; am Telefon ging das bisher nicht.",
    ),
  ],
};

export default notiz;
