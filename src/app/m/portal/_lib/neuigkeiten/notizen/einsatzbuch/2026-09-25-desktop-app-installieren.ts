// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "desktop-app-installieren",
  datum: "2026-09-25",
  titel: "Die Desktop-App gibt es für Windows und macOS",
  inhalt: [
    absatz(
      "Die Desktop-App des Einsatzbuchs lässt sich jetzt auf Windows und macOS installieren und hält sich selbst aktuell. " +
        "Ein Update wartet, bis kein Einsatz aussteht und niemand angemeldet ist. " +
        "Unter „Rechner“ siehst du den letzten Kontakt und die letzte Sicherung und entfernst alte Testrechner mit „Test-Rechner löschen“.",
    ),
  ],
};

export default notiz;
