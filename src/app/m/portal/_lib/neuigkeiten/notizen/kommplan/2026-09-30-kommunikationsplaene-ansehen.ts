// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Kommunikationspläne ansehen und drucken",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Kommunikationspläne und Fernmeldeskizzen als Diagramm, das sich selbst anordnet. " +
        "Du kannst hineinzoomen, Stellen einklappen und jeden Plan über „Drucken (A4 quer)“ ausgeben oder als PDF sichern. " +
        "Anlegen und bearbeiten kannst du Pläne noch nicht; dabei hilft der Betrieb.",
    ),
  ],
};

export default notiz;
