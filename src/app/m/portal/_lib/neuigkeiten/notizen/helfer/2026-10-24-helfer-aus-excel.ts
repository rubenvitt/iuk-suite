// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "helfer",
  slug: "helfer-aus-excel",
  datum: "2026-10-24",
  titel: "Helfer aus einer Excel-Datei übernehmen",
  inhalt: [
    absatz(
      "Ohne HiOrg-Server kannst du die Helferliste jetzt als Excel-Datei hochladen. Stell dazu unter Einstellungen die Quelle „Excel-Datei“ ein " +
        "und lade die Liste unter Abgleich hoch; dort gibt es auch eine Vorlage mit den Spalten.",
    ),
    absatz(
      "Die Datei gilt als ganze Liste: wer nicht mehr darin steht, wird beim Übernehmen gelöscht. Gelesen werden nur die Spalten der Vorlage, die Datei selbst wird nicht gespeichert.",
    ),
  ],
};

export default notiz;
