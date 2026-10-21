// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "statistik",
  datum: "2026-10-21",
  titel: "Verbrauch und Verfall als Diagramme",
  inhalt: [
    absatz(
      "Unter Verwaltung → Statistik siehst du, wie viel Material je Monat verbraucht wurde, " +
        "was am meisten gebraucht wird und wie lange der Bestand im Handlager noch reicht. " +
        "Dazu kommen Nachschub und Fehlmengen je Fahrzeug oder Tasche, Aussonderungen und was in den nächsten zwölf Monaten abläuft.",
    ),
  ],
};

export default notiz;
