// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "checkliste-verfall-leer",
  datum: "2026-09-14",
  titel: "Verfall auf der Checkliste zum Eintragen",
  inhalt: [
    absatz(
      "Auf der gedruckten Checkliste und im PDF ist die Spalte „Verfall“ jetzt leer, wie „Ist“. " +
        "Trag den Monat ein, den du am Fahrzeug abliest. Der Check am Bildschirm zeigt den " +
        "zuletzt gemeldeten Verfall weiterhin an.",
    ),
  ],
};

export default notiz;
