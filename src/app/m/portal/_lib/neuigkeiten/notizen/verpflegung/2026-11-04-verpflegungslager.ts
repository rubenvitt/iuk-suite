// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "verpflegung",
  slug: "verpflegungslager",
  datum: "2026-11-04",
  titel: "Getränke und Lebensmittel mit Haltbarkeit im Blick",
  inhalt: [
    absatz(
      "Im neuen Verpflegungslager steht jede Packung mit ihrem Haltbarkeitsdatum; was bald abläuft, zeigen MHD-Kontrolle und Was steht an. " +
        "Am Telefon scannst du den Strichcode und buchst ein, gibst aus oder sonderst aus. " +
        "Helfer ohne Konto buchen über einen Helfer-Link der Verwaltung.",
    ),
  ],
};

export default notiz;
