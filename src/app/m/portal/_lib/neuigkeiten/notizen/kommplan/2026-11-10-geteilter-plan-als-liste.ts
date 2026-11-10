// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "geteilter-plan-als-liste",
  datum: "2026-11-10",
  titel: "Geteilte Pläne am Telefon als Liste",
  inhalt: [
    absatz(
      "Öffnet jemand einen geteilten Link am Telefon, steht der Plan zuerst als Liste da, und Telefonnummern lassen sich antippen. " +
        "Mit „Liste“ und „Diagramm“ wechselst du zwischen beiden Ansichten, auch am Computer.",
    ),
  ],
};

export default notiz;
