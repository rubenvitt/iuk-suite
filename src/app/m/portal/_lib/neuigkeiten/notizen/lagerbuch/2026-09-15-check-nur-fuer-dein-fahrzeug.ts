// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-nur-fuer-dein-fahrzeug",
  datum: "2026-09-15",
  titel: "Check ohne Fahrzeugauswahl",
  inhalt: [
    absatz(
      "Scannst du den Code eines Fahrzeugs, führt dich der Fahrzeug-Check direkt zu diesem " +
        "Fahrzeug — ohne Auswahlliste und auch dann, wenn du unten auf „Fahrzeug-Check“ tippst. " +
        "Für ein anderes Fahrzeug scannst du dessen Code. Mit dem allgemeinen Code der " +
        "Bereitschaft wählst du wie bisher aus allen Fahrzeugen.",
    ),
  ],
};

export default notiz;
