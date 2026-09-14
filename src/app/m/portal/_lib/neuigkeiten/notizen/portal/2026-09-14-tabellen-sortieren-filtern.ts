// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "tabellen-sortieren-filtern",
  datum: "2026-09-14",
  titel: "Tabellen sortieren und filtern in der Spalte",
  inhalt: [
    absatz(
      "In allen Apps sortierst du eine Tabelle jetzt, indem du auf die Spaltenüberschrift klickst. " +
        "Ein zweiter Klick dreht die Reihenfolge um. Zum Filtern nimmst du das Trichtersymbol " +
        "neben der Überschrift.",
    ),
    absatz(
      "Die Knopfleisten über den Tabellen entfallen dafür. Was dort „inaktive ausblenden“ oder " +
        "„unter Mindestbestand“ hieß, steht jetzt im Filter der Spalte „Status“. Die Freitextsuche " +
        "bleibt, wo sie war.",
    ),
  ],
};

export default notiz;
