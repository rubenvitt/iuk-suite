// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "entnahmebox-einraeumen",
  datum: "2026-09-16",
  titel: "Aus der Entnahmebox ins Handlager einräumen",
  inhalt: [
    absatz(
      "Was in der Entnahmebox liegt, räumst du jetzt selbst zurück ins Handlager. " +
        "Unter „Auffüllen“ steht dafür oben „Aus der Entnahmebox einräumen“: " +
        "Artikel antippen, Charge und Schrank wählen, Menge eingeben. Du kannst " +
        "einen Posten auch aufteilen und auf zwei Schränke verteilen.",
    ),
    absatz(
      "Das Material wird dabei umgeräumt, nicht neu angenommen: der Bestand in der " +
        "Box sinkt um genau die Menge, die im Schrank ankommt, und das Verfallsdatum " +
        "der Charge bleibt erhalten.",
    ),
  ],
};

export default notiz;
