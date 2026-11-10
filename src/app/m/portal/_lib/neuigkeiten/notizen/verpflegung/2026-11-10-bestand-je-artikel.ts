// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "verpflegung",
  slug: "bestand-je-artikel",
  datum: "2026-11-10",
  titel: "Bestand je Artikel, Buchen auch am Schreibtisch",
  inhalt: [
    absatz(
      "Unter Bestand steht jetzt jeder Artikel in einer Zeile, seine Chargen klappst du darunter auf. " +
        "Die MHD-Kontrolle findest du dort als Auswahl Abgelaufen, Kritisch und Bald. " +
        "Einbuchen, Ausgeben und Aussondern gehen direkt in der Zeile.",
    ),
  ],
};

export default notiz;
