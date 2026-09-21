// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "listen-nachladen",
  datum: "2026-09-21",
  titel: "Geräte und Ausleihen laden beim Scrollen weiter",
  inhalt: [
    absatz(
      "Unter Verwaltung → Geräte und Verwaltung → Ausleihen gibt es kein Zurück und Weiter " +
        "mehr: die Liste lädt beim Scrollen die nächsten Einträge nach. Unter der Liste " +
        "steht, wie viele von wie vielen geladen sind.",
    ),
  ],
};

export default notiz;
