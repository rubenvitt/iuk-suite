// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "app-symbol",
  datum: "2026-10-18",
  titel: "Eigenes Symbol auf dem Startbildschirm",
  inhalt: [
    absatz(
      "Legst du eine Seite der Suite über „Zum Home-Bildschirm“ ab oder installierst du " +
        "QR-Codes oder das Drohnentraining als App, erscheint jetzt das Zeichen der " +
        "Anwendung als Symbol.",
    ),
  ],
};

export default notiz;
