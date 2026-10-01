// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Kommunikationspläne ansehen, erstellen, drucken und teilen",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken“ in A4 oder A3. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an, baust ihn in Diagramm oder „Gliederung“ auf " +
        "und gibst ihn über „Teilen“ als Link weiter, der ohne Anmeldung den aktuellen Stand zeigt.",
    ),
  ],
};

export default notiz;
