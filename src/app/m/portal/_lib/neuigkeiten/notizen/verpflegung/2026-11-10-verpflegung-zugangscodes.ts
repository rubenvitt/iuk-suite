// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "verpflegung",
  slug: "verpflegung-zugangscodes",
  datum: "2026-11-10",
  titel: "Helfer-Links heißen jetzt Zugangscodes",
  inhalt: [
    absatz(
      "Die Helfer-Links findest du jetzt unter Zugangscodes, so wie im Lagerbuch und bei den Funkgeräten. " +
        "Neue legst du dort mit Zugangscode anlegen an.",
    ),
  ],
};

export default notiz;
