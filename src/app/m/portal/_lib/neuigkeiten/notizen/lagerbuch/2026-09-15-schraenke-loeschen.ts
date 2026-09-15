// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "schraenke-loeschen",
  datum: "2026-09-15",
  titel: "Leere Schränke lassen sich löschen",
  inhalt: [
    absatz(
      "Unter Verwaltung → Lagerorte steht neben Bearbeiten und Stilllegen jetzt Löschen. " +
        "Hängen an einem Schrank noch Buchungen oder Geräte, kannst du ihn weiterhin nur " +
        "stilllegen — beim Löschversuch erfährst du, was ihn hält.",
    ),
  ],
};

export default notiz;
