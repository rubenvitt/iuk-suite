// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "anleitung-fuer-den-rechner",
  datum: "2026-10-29",
  titel: "Anleitung für den Einsatzbuch-Rechner",
  inhalt: [
    absatz(
      "Unter Rechner lädst du mit Anleitung für den Rechner (PDF) ein A4-Blatt herunter, das du neben den Rechner legen kannst. " +
        "Es zeigt mit Bildern der Desktop-App, wie man einen Einsatz hinterher dokumentiert, noch einmal prüft und versiegelt.",
    ),
  ],
};

export default notiz;
