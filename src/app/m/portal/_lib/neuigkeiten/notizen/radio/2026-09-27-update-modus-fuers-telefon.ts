// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Admin- und Updater-Gruppe der Funkgeräte.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "update-modus-fuers-telefon",
  datum: "2026-09-27",
  titel: "Update-Modus für das Telefon",
  inhalt: [
    absatz(
      "Verwaltung → Update-Modus hat große Felder und Knöpfe und steht in einer Spalte, " +
        "damit du ihn neben dem Gerät mit dem Daumen bedienen kannst. " +
        "Jede Karte zeigt jetzt auch die bisherige Version und das letzte Update.",
    ),
  ],
};

export default notiz;
