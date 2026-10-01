// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Pläne und Fernmeldeskizzen erstellen, drucken und teilen",
  inhalt: [
    absatz(
      "Du siehst Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken“ in A4 quer oder A3 quer. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an, baust ihn im Diagramm oder in der „Gliederung“ auf " +
        "und gibst ihn über „Teilen“ als Link weiter, der ohne Anmeldung den aktuellen Stand zeigt.",
    ),
  ],
};

export default notiz;
