// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "chargen-im-handlager",
  datum: "2026-09-16",
  titel: "Beim Entnehmen stehen nur noch die Chargen im Handlager",
  inhalt: [
    absatz(
      "Öffnest du einen Artikel zum Entnehmen, listet „Nächste Charge zuerst“ nur noch die " +
        "Chargen, von denen im Handlager etwas liegt. Chargen, die komplett in einem Fahrzeug " +
        "oder einer Tasche liegen, stehen darunter hinter „Auch … ohne Bestand im Handlager " +
        "zeigen“ — mit der Zeile, die sagt, wo sie sind.",
    ),
  ],
};

export default notiz;
