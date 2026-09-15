// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "abgelaufenes-je-fahrzeug",
  datum: "2026-09-15",
  titel: "Abgelaufenes Material je Fahrzeug",
  inhalt: [
    absatz(
      "Unter „Verfall“ kannst du die Meldungen nach Einheit filtern oder mit " +
        "„nach Einheit“ gruppiert anzeigen: je Fahrzeug und Tasche eine aufklappbare " +
        "Zeile mit Bilanz.",
    ),
    absatz(
      "Unter „Fahrzeuge und Taschen“ unterscheidet die Spalte „Verfall“ jetzt, was bereits " +
        "abgelaufen ist und was erst bald abläuft.",
    ),
    absatz(
      "Dieselbe Spalte sagt jetzt auch, für wie viele Artikel eines Fahrzeugs überhaupt " +
        "schon ein Verfall erfasst ist — etwa „3 von 8 erfasst“. „Im grünen Bereich“ steht " +
        "nur noch da, wo wirklich jeder Artikel angesehen wurde.",
    ),
  ],
};

export default notiz;
