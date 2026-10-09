// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Admin- und Updater-Gruppe der Funkgeräte.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "fahrzeuge-im-update-modus",
  datum: "2026-10-09",
  titel: "Fahrzeuge im Update-Modus",
  inhalt: [
    absatz(
      "Im Update-Modus siehst du ohne Suche jedes Fahrzeug mit Balken: offen, teilweise oder " +
        "fertig. Tippst du eins an, stehen dort seine Geräte. Mit „Nicht aktualisiert“ hältst " +
        "du fest, warum ein Update scheiterte, und ein Kommentar im Anmerkungsfeld wird beim " +
        "Aktualisieren mitgespeichert.",
    ),
  ],
};

export default notiz;
