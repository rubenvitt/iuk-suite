// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "einheiten-aus-der-fahrzeugverwaltung",
  datum: "2026-10-21",
  titel: "Fahrzeuge kommen aus der Fahrzeugverwaltung",
  inhalt: [
    absatz(
      "Unter Fahrzeuge und Taschen übernimmt „Mit Fahrzeugverwaltung abgleichen“ Name und Kennzeichen deiner Fahrzeuge aus der App Fahrzeuge; Soll, Bestand und Checks bleiben, wo sie sind. " +
        "Ein neues Fahrzeug wählst du bei „Neue Einheit“ aus der Fahrzeugverwaltung aus, Taschen legst du weiter frei an.",
    ),
  ],
};

export default notiz;
