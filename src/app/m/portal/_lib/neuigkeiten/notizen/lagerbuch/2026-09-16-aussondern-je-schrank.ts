// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "aussondern-je-schrank",
  datum: "2026-09-16",
  titel: "Verfall nennt den Schrank",
  inhalt: [
    absatz(
      "Unter „Verfall“ steht bei jeder Charge im Handlager jetzt, in welchem Schrank sie " +
        "liegt und wie viel davon. Liegt dieselbe Charge in mehreren Schränken, fragt " +
        "„aussondern“ nach, welchen du meinst — oder du bleibst bei „Alles“ und räumst sie " +
        "überall heraus.",
    ),
  ],
};

export default notiz;
