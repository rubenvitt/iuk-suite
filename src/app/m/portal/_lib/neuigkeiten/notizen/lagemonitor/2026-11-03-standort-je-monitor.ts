// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "standort-je-monitor",
  datum: "2026-11-03",
  titel: "Jeder Lagemonitor hat seinen eigenen Standort",
  inhalt: [
    absatz(
      "Den Standort stellst du jetzt je Monitor ein, unter Monitore und ihr Standort mit dem Knopf Standort: GPS eines Fahrzeugs oder ein fester Ort mit eigenem taktischen Zeichen. " +
        "Die Karte steht auf dem eigenen Zeichen statt auf einem Punkt und zoomt so weit heraus, dass Fahrzeuge und feste Orte bis 50 km mit drauf sind.",
    ),
  ],
};

export default notiz;
