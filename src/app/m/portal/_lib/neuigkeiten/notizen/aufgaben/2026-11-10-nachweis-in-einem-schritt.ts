// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "aufgaben",
  slug: "nachweis-in-einem-schritt",
  datum: "2026-11-10",
  titel: "Foto und Fertig melden in einem Schritt",
  inhalt: [
    absatz(
      "Auf der Aufgabe wählst du das Foto, schreibst bei Bedarf einen Text dazu und tippst auf „Fertig melden“. " +
        "Unter „Personen“ legst du neue Personen über „Person anlegen“ an, die Zeit pro Tag gibst du in Stunden ein.",
    ),
  ],
};

export default notiz;
