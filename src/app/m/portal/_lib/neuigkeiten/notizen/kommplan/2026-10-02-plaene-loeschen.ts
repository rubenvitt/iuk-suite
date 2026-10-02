// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "plaene-loeschen",
  datum: "2026-10-02",
  titel: "Pläne endgültig löschen",
  inhalt: [
    absatz(
      "Mit Bearbeitungsrecht löschst du im „Archiv“ einen Plan über „Aktionen“ und „Endgültig löschen“; seine Links funktionieren danach nicht mehr. " +
        "Einen Plan, den du vor weniger als einer Stunde angelegt hast, löschst du unter „Aktionen“ direkt mit „Löschen“, ohne Umweg über das Archiv.",
    ),
  ],
};

export default notiz;
