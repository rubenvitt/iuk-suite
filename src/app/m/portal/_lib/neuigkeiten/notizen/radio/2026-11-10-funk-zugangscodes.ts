// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "funk-zugangscodes",
  datum: "2026-11-10",
  titel: "Zugänge heißen jetzt Zugangscodes",
  inhalt: [
    absatz(
      "Die Zugänge für die Ausleihe ohne Anmeldung findest du jetzt unter Zugangscodes, so wie im Lagerbuch und im Verpflegungslager. " +
        "Einen neuen legst du oben rechts mit Zugangscode anlegen an, einen gesperrten holst du mit Entsperren zurück.",
    ),
  ],
};

export default notiz;
