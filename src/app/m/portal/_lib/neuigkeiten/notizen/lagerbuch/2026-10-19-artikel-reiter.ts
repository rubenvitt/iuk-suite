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
        "Stammdaten und Namen änderst du über „Bearbeiten“, gespeichert wird erst mit „Speichern“. " +
        "Dort findest du auch „Artikel löschen“.",
    ),
  ],
};

export default notiz;
