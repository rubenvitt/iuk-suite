// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "fahrzeuge-aus-der-fahrzeugverwaltung",
  datum: "2026-10-21",
  titel: "Fahrzeuge aus der Fahrzeugverwaltung übernehmen",
  inhalt: [
    absatz(
      "Unter Stammdaten → Fahrzeuge übernimmst du mit „Aus Fahrzeugverwaltung abgleichen“ Typ, Kennung, Funkrufname und Standort aus der App Fahrzeuge. " +
        "Was dort außer Dienst ist, wird hier deaktiviert; eigene Fahrzeuge wie Leihfahrzeuge bleiben, wie sie sind.",
    ),
  ],
};

export default notiz;
