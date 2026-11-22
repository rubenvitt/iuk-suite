// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "geraete-einzeln-und-selbsttest",
  datum: "2026-11-23",
  titel: "Geräte im Check einzeln prüfen, mit Selbsttest",
  inhalt: [
    absatz(
      "Im Check gibt es bei den Geräten keinen Knopf Alle in Ordnung mehr, du beantwortest jedes Gerät einzeln. " +
        "Hakst du an einem Gerät Im Check nach dem Selbsttest fragen an, fragt der Check dort zusätzlich nach " +
        "dem Selbsttest, und ein nicht bestandener Selbsttest landet wie ein Defekt unter Mängel.",
    ),
  ],
};

export default notiz;
