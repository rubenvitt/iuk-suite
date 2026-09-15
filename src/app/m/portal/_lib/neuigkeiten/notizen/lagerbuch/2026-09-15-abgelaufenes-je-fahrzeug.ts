// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "abgelaufenes-je-fahrzeug",
  datum: "2026-09-15",
  titel: "Abgelaufenes Material je Fahrzeug",
  inhalt: [
    absatz(
      "Unter „Verfall“ kannst du die Meldungen aus den Fahrzeugen jetzt nach Fahrzeug " +
        "filtern und nach Artikel, Ablaufmonat oder Status sortieren. Unter „Fahrzeuge“ " +
        "unterscheidet die Spalte „Verfall“ außerdem, was bereits abgelaufen ist und was " +
        "erst bald abläuft — vorher stand beides zusammen in einer Zahl.",
    ),
    absatz(
      "Dieselbe Spalte sagt jetzt auch, für wie viele Artikel eines Fahrzeugs überhaupt " +
        "schon ein Verfall erfasst ist — etwa „3 von 8 erfasst“. „Im grünen Bereich“ steht " +
        "nur noch da, wo wirklich jeder Artikel angesehen wurde.",
    ),
  ],
};

export default notiz;
