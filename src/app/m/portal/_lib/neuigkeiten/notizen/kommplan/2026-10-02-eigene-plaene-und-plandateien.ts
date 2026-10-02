// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "eigene-plaene-und-plandateien",
  datum: "2026-10-02",
  titel: "Eigene Pläne anlegen, teilen und als Datei weitergeben",
  inhalt: [
    absatz(
      "Über „Neu“ legst du selbst Pläne an; ein neuer Plan ist privat, nur du siehst ihn. " +
        "Unter „Teilen“ machst du ihn für die Organisation sichtbar und lädst Personen zum Mitbearbeiten ein. " +
        "„Exportieren“ speichert einen Plan als Datei, „Importieren“ in der Planliste macht daraus wieder einen Plan.",
    ),
  ],
};

export default notiz;
