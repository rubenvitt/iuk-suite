// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "verpflegung",
  slug: "verpflegungslager",
  datum: "2026-11-04",
  titel: "Getränke und Lebensmittel mit Haltbarkeit im Blick",
  inhalt: [
    absatz(
      "In der neuen App Verpflegungslager steht jede Packung mit ihrem Haltbarkeitsdatum auf den Tag genau. " +
        "Am Telefon scannst du den Strichcode, buchst ein, gibst aus oder sonderst aus; was zuerst abläuft, wird zuerst angeboten. " +
        "Was bald abläuft, steht unter MHD-Kontrolle und Was steht an.",
    ),
    absatz("Helfer ohne Konto buchen über einen Helfer-Link, den die Verwaltung für einen Anlass anlegt."),
  ],
};

export default notiz;
