// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "lagerorte-aus-der-fahrzeugverwaltung",
  datum: "2026-10-21",
  titel: "Fahrzeuge als Lagerort aus der Fahrzeugverwaltung",
  inhalt: [
    absatz(
      "Beim Lagerort eines Geräts schlägt dir das Formular jetzt auch die Fahrzeuge aus der App Fahrzeuge vor. " +
        "Unter Geräte bringt „Mit Fahrzeugverwaltung abgleichen“ die Lagerorte auf die Fahrzeugnamen von dort, und wenn ein Fahrzeug dort umbenannt wird, ziehen seine Geräte beim nächsten Abgleich mit.",
    ),
  ],
};

export default notiz;
