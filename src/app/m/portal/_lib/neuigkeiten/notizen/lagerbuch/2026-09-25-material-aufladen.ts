// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "material-aufladen",
  datum: "2026-09-25",
  titel: "Material direkt auf ein Fahrzeug packen",
  inhalt: [
    absatz(
      "Auf dem Blatt eines Fahrzeugs oder einer Tasche gibt es „Material aufladen“. Unter " +
        "„Woher“ wählst du einen Ort, an dem der Artikel liegt, etwa einen Schrank oder ein " +
        "anderes Fahrzeug, und dann die Charge. Oder du wählst „Neu angeliefert“, wenn das " +
        "Material direkt vom Lieferanten kommt.",
    ),
  ],
};

export default notiz;
