// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatztagebuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "heisst-jetzt-einsatztagebuch",
  datum: "2026-11-04",
  titel: "Aus dem Einsatzbuch wird das Einsatztagebuch",
  inhalt: [
    absatz(
      "Das Einsatzbuch heißt jetzt Einsatztagebuch, in der Suite wie in der Desktop-App. " +
        "Adresse, Zugang und deine Einsätze bleiben, wie sie sind.",
    ),
  ],
};

export default notiz;
