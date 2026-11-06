// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "ki-assistent",
  datum: "2026-11-06",
  titel: "Gerätewartung mit einem KI-Assistenten",
  inhalt: [
    absatz(
      "Du kannst die Gerätewartung jetzt auch aus Claude oder einem anderen KI-Assistenten heraus nutzen, mit der Adresse mcp.iuk-ue.de/mcp und deiner gewohnten Anmeldung. " +
        "Der Assistent darf dabei genau das, was du in der App darfst: Geräte ansehen, prüfen und Mängel melden, als Verwalter auch Geräte pflegen.",
    ),
  ],
};

export default notiz;
