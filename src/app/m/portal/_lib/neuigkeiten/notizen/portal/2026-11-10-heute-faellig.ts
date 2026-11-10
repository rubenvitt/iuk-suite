// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "heute-faellig",
  datum: "2026-11-10",
  titel: "„Fällig“ für alles, was heute ansteht",
  inhalt: [
    absatz(
      "Unter „Was steht an“ steht zwischen „überfällig“ und „bald fällig“ jetzt „fällig“: die Frist endet heute. " +
        "Mit der Auswahl „Fällig“ siehst du nur diese Einträge.",
    ),
  ],
};

export default notiz;
