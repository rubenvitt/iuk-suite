// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "schichtplan",
  slug: "schichten-im-voraus-planen",
  datum: "2026-11-01",
  titel: "Schichten im Voraus planen",
  inhalt: [
    absatz(
      "In der neuen App Schichtplanung legst du für eine Veranstaltung oder große Lage Abschnitte und Fahrzeuge an, ziehst Schichten im Raster auf und ziehst Helfer darauf.",
    ),
    absatz(
      "Unter Prüfen siehst du offene Plätze, doppelt Verplante, fehlende Qualifikationen wie Fahrerlaubnis C1 und zu lange Dienste. " +
        "Unter Ausgabe druckst du Pläne je Abschnitt oder je Helfer und lädst alles als Excel herunter.",
    ),
  ],
};

export default notiz;
