// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "zeichen-grosser-text-und-beschriftung-aussen",
  datum: "2026-10-05",
  titel: "Eigene Zeichen: großer Mitteltext und Text neben dem Zeichen",
  inhalt: [
    absatz(
      "Beim Bauen eines eigenen Zeichens stellst du den mittigen Text jetzt auf „Groß“, wie „LtS“ an der Leitstelle. " +
        "Unter „Beschriftung außerhalb“ setzt du Text neben das Zeichen, etwa das Kreiskürzel unten rechts. " +
        "Ob ein Wert abgeleitet ist, zeigt der Tooltip.",
    ),
  ],
};

export default notiz;
