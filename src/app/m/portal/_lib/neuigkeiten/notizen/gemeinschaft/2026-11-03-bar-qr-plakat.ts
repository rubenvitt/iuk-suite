// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "bar-qr-plakat",
  datum: "2026-11-03",
  titel: "Bar-Anfrage teilen und aushängen",
  inhalt: [
    absatz(
      "Unter Vermietung, Belegung öffnest du oben die Anfrageseite der Bar oder kopierst ihren Link zum Weiterschicken. Über QR-Plakat bekommst du ein A4-Blatt mit QR-Code als PDF zum Ausdrucken und Aushängen.",
    ),
  ],
};

export default notiz;
