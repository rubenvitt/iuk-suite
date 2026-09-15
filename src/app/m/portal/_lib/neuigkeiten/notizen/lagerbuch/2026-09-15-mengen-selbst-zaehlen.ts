// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mengen-selbst-zaehlen",
  datum: "2026-09-15",
  titel: "Zählen beginnt bei 0",
  inhalt: [
    absatz(
      "Im Fahrzeug-Check startet jede Position bei 0. Du zählst mit „+“ hoch, was du wirklich " +
        "findest; ist ein Fach leer, tippst du einmal auf „−“. Vorher stand überall schon die " +
        "Sollmenge, und wer durchtippte, meldete einen vollen Wagen.",
    ),
    absatz(
      "„Weiter“ steht jetzt am Ende der Liste statt mitzuschweben und wird erst frei, wenn jede " +
        "Position gezählt ist. Wie viele noch fehlen, steht daneben.",
    ),
  ],
};

export default notiz;
