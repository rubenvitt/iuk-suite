// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "files",
  slug: "lesbare-dateigroesse",
  datum: "2026-09-05",
  titel: "Die Dateigröße ist leichter zu lesen",
  inhalt: [
    absatz(
      "Bei „Neue Freigabe“ zeigt dir eine zu große Datei die erlaubte Obergrenze jetzt " +
        "verständlich an.",
    ),
    absatz(
      "Du siehst die Grenze in MiB statt als lange Zahl einzelner Bytes. So kannst du die Größe " +
        "deiner Datei direkt mit der erlaubten Größe vergleichen.",
    ),
    absatz(
      "Die zulässige Größe bleibt unverändert. Deine vorhandenen Freigaben bleiben ebenfalls " +
        "unverändert erhalten.",
    ),
  ],
};

export default notiz;
