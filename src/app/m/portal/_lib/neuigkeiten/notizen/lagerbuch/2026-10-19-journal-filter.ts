// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "journal-filter",
  datum: "2026-10-19",
  titel: "Journal nach Ort und Artikel",
  inhalt: [
    absatz(
      "Im „Journal“ filterst du jetzt nach Ort und Artikel; „Im Journal anzeigen“ an einer " +
        "Einheit oder einem Artikel führt direkt dorthin. „Kontrolle erfassen“ (BZ-Gerät), " +
        "„Neue Messung“ (Sauerstoff) und „Auf alle Einheiten übertragen“ (Vorlage) stehen jetzt " +
        "oben auf der Seite, Stammdaten änderst du dort über „Bearbeiten“.",
    ),
  ],
};

export default notiz;
