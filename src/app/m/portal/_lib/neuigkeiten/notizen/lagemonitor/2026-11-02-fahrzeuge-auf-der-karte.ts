// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "fahrzeuge-auf-der-karte",
  datum: "2026-11-02",
  titel: "Fahrzeuge auf der Karte des Lagemonitors",
  inhalt: [
    absatz(
      "Unter Fahrzeuge auf der Karte wählst du ein Fahrzeug, sein taktisches Zeichen und den Zugang, über den sein Lagemonitor die Position meldet. " +
        "Alle Lagemonitore zeigen das Fahrzeug dann mit Zeichen und Funkrufname; eine Position, die älter als zehn Minuten ist, erscheint ausgegraut mit Uhrzeit.",
    ),
  ],
};

export default notiz;
