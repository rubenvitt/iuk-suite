// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "artikel-reiter",
  datum: "2026-10-19",
  titel: "Artikeldetails in Reitern",
  inhalt: [
    absatz(
      "Die Artikeldetails unter „Artikel“ sind in die Reiter „Übersicht“, „Buchen“, „Stammdaten“ " +
        "und „Verlauf“ geteilt; Zugang, Entnahme und Umlagern wählst du unter „Buchen“. " +
        "Name, Stammdaten und „Artikel löschen“ findest du unter „Stammdaten“ → „Bearbeiten“; gespeichert wird erst mit „Speichern“.",
    ),
  ],
};

export default notiz;
