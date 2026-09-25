// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "geraeteliste-als-excel",
  datum: "2026-09-24",
  titel: "Geräteliste als Excel-Datei",
  inhalt: [
    absatz(
      "„Exportieren“ unter Verwaltung → Geräte liefert jetzt eine Excel-Datei statt einer " +
        "CSV-Datei. Unter Verwaltung → Import kannst du diese Datei unverändert oder " +
        "bearbeitet wieder hochladen; CSV-Dateien nimmt der Import weiterhin an.",
    ),
  ],
};

export default notiz;
