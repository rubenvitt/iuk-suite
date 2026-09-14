// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-je-charge",
  datum: "2026-09-14",
  titel: "Inventur je Charge und mit Verlauf",
  inhalt: [
    absatz(
      "In der Inventur klappst du einen Artikel auf und zählst je Charge. Eine Charge, die im Regal liegt, " +
        "aber fehlt, ergänzt du dort mit ihrem MHD. Über Kategorie und Fach begrenzt du die Liste.",
    ),
    absatz("Unter Verwaltung → Inventur → Verlauf findest du jede ab jetzt abgeschlossene Inventur mit allen gezählten Positionen."),
  ],
};

export default notiz;
