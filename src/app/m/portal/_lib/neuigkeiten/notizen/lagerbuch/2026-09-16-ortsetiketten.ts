// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "ortsetiketten",
  datum: "2026-09-16",
  titel: "Ein QR-Code je Handlager und Einheit",
  inhalt: [
    absatz(
      "Unter „Verwaltung → Ortsetiketten“ druckst du ein Etikett je Handlager, Fahrzeug und " +
        "Tasche — ein Blatt im Format A7, mit einem großen QR-Code darauf. Scannst du es am " +
        "Fahrzeug, öffnet sich dessen Check; am Handlager landest du in der Artikelliste.",
    ),
    absatz(
      "Die Etiketten je Artikel bleiben, wo sie sind: unter „Verwaltung → Etiketten“.",
    ),
  ],
};

export default notiz;
