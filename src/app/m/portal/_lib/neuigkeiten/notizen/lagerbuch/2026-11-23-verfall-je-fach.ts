// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "verfall-je-fach",
  datum: "2026-11-23",
  titel: "Verfall je Fach",
  inhalt: [
    absatz(
      "Liegt ein Artikel in mehreren Fächern, trägst du im Check das Verfallsdatum für jedes Fach einzeln ein, " +
        "zum Beispiel Schublade 03/2027 und Rucksack 06/2027. Unter Verfall und am Fahrzeug steht beim Artikel, " +
        "in welchem Fach was abläuft; gewarnt wird weiter mit dem frühesten Datum.",
    ),
  ],
};

export default notiz;
