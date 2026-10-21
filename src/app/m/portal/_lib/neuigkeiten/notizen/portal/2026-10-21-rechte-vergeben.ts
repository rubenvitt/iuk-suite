// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "rechte-vergeben",
  datum: "2026-10-21",
  titel: "Rechte im Portal vergeben",
  inhalt: [
    absatz(
      "Betreust du die Suite, findest du unter „Verwaltung“ jetzt „Rechte“. Dort wählst " +
        "du eine Person und schaltest für jedes Modul ein, ob sie es benutzen oder " +
        "verwalten darf. Das wirkt nach ihrer nächsten Anmeldung, spätestens nach einer Stunde.",
    ),
  ],
};

export default notiz;
