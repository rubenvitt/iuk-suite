// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "zeitzone-einstellen",
  datum: "2026-09-23",
  titel: "Alle Uhrzeiten in einer Zeitzone",
  inhalt: [
    absatz(
      "Alle Uhrzeiten der Suite stehen jetzt in derselben Zeitzone, auch im Audit-Log, das bisher " +
        "UTC zeigte. Voreingestellt ist Europe/Berlin; als Admin änderst du sie unter Verwaltung → " +
        "Zeitzone.",
    ),
  ],
};

export default notiz;
