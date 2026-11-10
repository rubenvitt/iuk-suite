// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "neuigkeiten-markiert",
  datum: "2026-11-10",
  titel: "Neuigkeiten zeigen, was neu ist",
  inhalt: [
    absatz(
      "Unter Neuigkeiten steht an allem, was seit deinem letzten Besuch dazugekommen ist, ein „Neu“. " +
        "Die Seite zeigt zuerst nur die jüngsten Einträge, ältere holst du mit „Ältere anzeigen“.",
    ),
  ],
};

export default notiz;
