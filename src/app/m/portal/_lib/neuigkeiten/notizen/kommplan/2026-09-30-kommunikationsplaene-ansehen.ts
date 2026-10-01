// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Pläne und Fernmeldeskizzen bearbeiten und drucken",
  inhalt: [
    absatz(
      "Pläne und Fernmeldeskizzen siehst du als Diagramm und druckst sie über „Drucken (A4 quer)“. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn mit „+ Unterstelle“, „+ links“, „+ rechts“ und „+ Einheit“ auf. " +
        "Alles speichert sich selbst.",
    ),
    absatz("In der „Gliederung“ legt Enter die nächste Stelle an, Tab rückt ein; eine eingefügte, eingerückte Liste wird ein ganzer Zweig."),
    absatz(
      "Unter „Bibliothek“ pflegst du Stellen, Einheiten und Verbindungen für „Aus Bibliothek“. " +
        "Unter „Aktionen“ findest du „Duplizieren“, „Archivieren“ und „Als Vorlage speichern“. " +
        "Organisation und Logo stehen unter „Einstellungen“.",
    ),
  ],
};

export default notiz;
