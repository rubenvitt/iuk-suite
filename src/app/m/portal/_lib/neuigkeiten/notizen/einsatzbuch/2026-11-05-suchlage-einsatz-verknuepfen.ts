// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "suchlage-einsatz-verknuepfen",
  datum: "2026-11-05",
  titel: "Desktop-App: Einsatz mit Suchlage verknüpfen",
  inhalt: [
    absatz(
      "War Suchlage dabei, wählst du im Formular unter „Suchlage-Einsatz“ den passenden Einsatz. " +
        "Ist dein Einsatz in der Suite angekommen, lässt sich der Suchlage-Einsatz nicht mehr löschen oder erneut wählen. " +
        "Unter Einstellungen bei „Suchlage“ trägst du dafür einen Großbild-Link mit „Für die IUK-Suite (Einsatztagebuch)“ ein.",
    ),
  ],
};

export default notiz;
