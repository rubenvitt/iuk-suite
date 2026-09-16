// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-nur-fuer-dein-fahrzeug",
  datum: "2026-09-15",
  titel: "Check ohne Auswahlliste",
  inhalt: [
    absatz(
      "Scannst du den Code einer Einheit, führt dich der Check direkt zu ihr — ohne " +
        "Auswahlliste und auch dann, wenn du unten auf „Check“ tippst. Für eine andere " +
        "Einheit scannst du deren Code. Mit dem allgemeinen Code der Bereitschaft wählst " +
        "du wie bisher aus allen Einheiten.",
    ),
  ],
};

export default notiz;
