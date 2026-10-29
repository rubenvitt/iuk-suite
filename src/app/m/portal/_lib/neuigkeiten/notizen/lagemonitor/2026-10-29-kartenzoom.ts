// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "kartenzoom",
  datum: "2026-10-29",
  titel: "Zoomstufe der Karte am Lagemonitor",
  inhalt: [
    absatz(
      "Unter Standort und Warnregion stellst du jetzt die Zoomstufe der Karte ein, also wie nah der Monitor ohne Einsatz an den Standort heranzoomt. " +
        "Läuft ein Einsatz in Suchlage, zeigt die Karte weiter das Suchgebiet.",
    ),
  ],
};

export default notiz;
