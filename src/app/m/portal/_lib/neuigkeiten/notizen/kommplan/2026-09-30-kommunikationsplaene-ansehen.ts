// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Kommunikationspläne ansehen, bearbeiten und drucken",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken (A4 quer)“. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn mit „+ Unterstelle“, „+ Einheit“, „+ links“ und „+ rechts“ auf. " +
        "Alles speichert sich selbst, „Rückgängig“ holt Schritte zurück.",
    ),
    absatz(
      "Unter „Gliederung“ bearbeitest du denselben Plan als eingerückte Liste: Enter legt die nächste Stelle an, Tab rückt ein, Umschalt+Tab rückt aus. " +
        "Fügst du eine eingerückte Liste ein, entsteht daraus ein ganzer Zweig. Am Telefon öffnet der Plan direkt in der Gliederung.",
    ),
  ],
};

export default notiz;
