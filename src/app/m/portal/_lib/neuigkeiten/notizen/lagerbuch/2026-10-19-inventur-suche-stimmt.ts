// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-suche-stimmt",
  datum: "2026-10-19",
  titel: "Inventur mit Suche und „Stimmt“",
  inhalt: [
    absatz(
      "In der Inventur findest du Artikel über die Suche; Enter springt bei einem Treffer ins Zählfeld. " +
        "Passt die erwartete Menge, tippst du auf „Stimmt“, und „Offen“ zeigt, was noch fehlt. " +
        "Kommentar und „Inventur abschließen“ stehen fest am unteren Rand, mit dem Stand „x von y erfasst“.",
    ),
  ],
};

export default notiz;
