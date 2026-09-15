// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "schrankname-eindeutig",
  datum: "2026-09-15",
  titel: "Jeder Schrankname kommt nur einmal vor",
  inhalt: [
    absatz(
      "Unter Verwaltung → Lagerorte kannst du einen Namen nicht mehr zweimal vergeben. " +
        "Bisher konnten zwei Schränke „Schrank 1“ heißen, und beim Buchen war nicht zu " +
        "erkennen, welchen der beiden du triffst.",
    ),
    hinweis(
      "Hieß bei euch bisher etwas doppelt, steht dort jetzt „(Dublette 2)“ hinter dem " +
        "Namen. Gib dem Schrank den Namen, der bei euch an ihm steht.",
    ),
  ],
};

export default notiz;
