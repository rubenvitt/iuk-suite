// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "qualifikationen-verwalten",
  datum: "2026-10-28",
  titel: "Qualifikationen selbst anlegen",
  inhalt: [
    absatz(
      "Unter Stammdaten → Qualifikationen legst du Qualifikationen fürs Personal an, änderst Kurzform, Bezeichnung und Rang oder entfernst eine, die niemand mehr trägt. " +
        "Änderst du eine Kurzform, bekommt das Personal mit dieser Qualifikation die neue; abgeschlossene Einsätze behalten die alte.",
    ),
  ],
};

export default notiz;
