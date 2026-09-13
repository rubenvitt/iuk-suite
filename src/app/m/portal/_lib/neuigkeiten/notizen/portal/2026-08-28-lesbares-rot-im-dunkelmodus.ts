// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "lesbares-rot-im-dunkelmodus",
  datum: "2026-08-28",
  titel: "Rote Schrift im Dunkelmodus",
  inhalt: [
    absatz(
      "Links, Fehlermeldungen und rote Knöpfe wie „Löschen“ stehen im Dunkelmodus jetzt in " +
        "einem helleren Rot und heben sich wieder vom Hintergrund ab. Im hellen Modus ändert " +
        "sich nichts.",
    ),
  ],
};

export default notiz;
