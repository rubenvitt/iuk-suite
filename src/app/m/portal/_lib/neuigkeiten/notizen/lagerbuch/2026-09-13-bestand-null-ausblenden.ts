// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "bestand-null-ausblenden",
  datum: "2026-09-13",
  titel: "Artikel ohne Bestand ausblenden",
  inhalt: [
    absatz(
      "Unter Verwaltung → Artikel & Bestand blendet „Bestand 0 ausblenden“ alle Artikel aus, von " +
        "denen im Handlager nichts mehr liegt. Die Artikel bleiben erhalten — nimm den Haken weg, " +
        "und sie stehen wieder da. Auch die Excel-Liste enthält dann nur noch, was du siehst.",
    ),
  ],
};

export default notiz;
