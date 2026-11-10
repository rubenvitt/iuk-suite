// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "meldungen-und-einrichtung",
  datum: "2026-11-10",
  titel: "Lagemonitor startet mit den Meldungen",
  inhalt: [
    absatz(
      "Der Lagemonitor öffnet jetzt mit „Meldungen“, dort legst du eine Meldung gleich oben an. " +
        "Anzeige, Meldekategorien, Monitore, Fahrzeuge und Lagekarte findest du unter „Einrichtung“.",
    ),
  ],
};

export default notiz;
