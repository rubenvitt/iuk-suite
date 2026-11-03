// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "apps-anheften",
  datum: "2026-11-03",
  titel: "Deine Apps zuerst",
  inhalt: [
    absatz(
      "Siehst du viele Apps, stehen unter Apps & Dienste oben nur die angehefteten und die zuletzt geöffneten. " +
        "Den Rest findest du unter Alle Apps & Dienste, nach Bereichen geordnet; dort heftest du mit der Nadel an oder löst wieder. " +
        "Der Umschalter oben links zeigt dieselbe Auswahl.",
    ),
  ],
};

export default notiz;
