// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "bar-testanfragen",
  datum: "2026-11-09",
  titel: "Testanfragen für die Bar räumen sich selbst weg",
  inhalt: [
    absatz(
      "Eine Anfrage für die Bar mit dem Anlass „Test“ wird einen Monat nach dem Absenden automatisch gelöscht, samt Dokumenten. Den Tag siehst du schon beim Ausfüllen, auf der Statusseite und unter Vermietung, Anfragen.",
    ),
  ],
};

export default notiz;
