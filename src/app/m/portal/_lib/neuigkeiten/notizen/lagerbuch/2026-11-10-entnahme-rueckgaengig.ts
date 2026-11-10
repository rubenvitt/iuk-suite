// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "entnahme-rueckgaengig",
  datum: "2026-11-10",
  titel: "Entnahme rückgängig machen",
  inhalt: [
    absatz(
      "Nach einer Entnahme am Regal steht unter der Meldung zehn Minuten lang der Knopf Rückgängig. " +
        "Später nimmt die Verwaltung eine Buchung im Journal mit Gegenbuchen zurück. " +
        "Abgelaufene Chargen lassen sich nicht mehr entnehmen.",
    ),
  ],
};

export default notiz;
