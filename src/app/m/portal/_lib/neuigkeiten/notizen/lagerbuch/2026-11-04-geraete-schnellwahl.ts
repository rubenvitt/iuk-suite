// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "geraete-schnellwahl",
  datum: "2026-11-04",
  titel: "Geräte mit einem Tipp eingrenzen",
  inhalt: [
    absatz(
      "Unter Geräte grenzt du die Liste jetzt über der Tabelle ein: Fällig, Ohne Datum oder Inaktiv, jeweils mit " +
        "der Anzahl. Die Auswahl ist dieselbe wie im Filter der Spalten Fälligkeit und Status.",
    ),
  ],
};

export default notiz;
