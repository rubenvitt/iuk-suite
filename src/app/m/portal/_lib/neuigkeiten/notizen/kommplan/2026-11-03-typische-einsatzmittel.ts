// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "typische-einsatzmittel",
  datum: "2026-11-03",
  titel: "Über 250 typische Einsatzmittel als Zeichen",
  inhalt: [
    absatz(
      "Bei der Zeichensuche findest du jetzt auch gängige Einsatzmittel der Hilfsorganisationen, etwa KTW-B, ELW 1, " +
        "Gruppenführer Sanitätsgruppe, Notarzt oder Rettungshundeführer. Gesucht wird nach Namen, Kürzel und gebräuchlichen Langformen.",
    ),
  ],
};

export default notiz;
