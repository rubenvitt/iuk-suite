// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "einsatznummer-der-leitstelle",
  datum: "2026-10-28",
  titel: "Desktop-App: Einsatznummer der Leitstelle",
  inhalt: [
    absatz(
      "Unter den Stichworten gibt es jetzt das Feld „Einsatznummer der Leitstelle“. " +
        "Was du dort einträgst, steht später in der Einsatzansicht und im Berichtsblatt; das Feld darf leer bleiben.",
    ),
  ],
};

export default notiz;
