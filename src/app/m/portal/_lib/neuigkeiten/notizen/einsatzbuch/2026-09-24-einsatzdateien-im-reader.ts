// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "einsatzdateien-im-reader",
  datum: "2026-09-24",
  titel: "Einsatzdateien im Browser öffnen",
  inhalt: [
    absatz(
      "Im Einsatzbuch öffnest du unter „Reader“ eine heruntergeladene .einsatzbuch-Datei mit ihrem Kennwort. " +
        "Du siehst, ob die Kette intakt ist, jeden Einsatz im Detail und den Einsatzbericht zum Drucken. " +
        "Die Datei wird nur in deinem Browser gelesen.",
    ),
  ],
};

export default notiz;
