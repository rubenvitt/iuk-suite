// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "fahrzeugwahl",
  datum: "2026-11-04",
  titel: "Fahrzeuge aus der Fahrzeugverwaltung wählen",
  inhalt: [
    absatz(
      "Steht ein Gerät auf einem Fahrzeug, schlägt dir das Feld Fahrzeug die Fahrzeuge aus der Fahrzeugverwaltung vor. " +
        "Du findest sie auch über Funkrufname, Funkkenner oder Kennzeichen. Ein Fahrzeug, das dort fehlt, tippst du weiter einfach ein.",
    ),
  ],
};

export default notiz;
