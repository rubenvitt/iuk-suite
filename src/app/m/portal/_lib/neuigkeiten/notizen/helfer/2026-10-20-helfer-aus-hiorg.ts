// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "helfer",
  slug: "helfer-aus-hiorg",
  datum: "2026-10-20",
  titel: "Aktive Helfer aus HiOrg-Server übernehmen",
  inhalt: [
    absatz(
      "Unter Abgleich holst du die aktiven Helferinnen und Helfer aus HiOrg-Server, mit einer Vorschau vor dem Übernehmen. " +
        "Gespeichert werden nur Name, Kontostatus, Gruppen und Qualifikationen. In der Liste legst du fest, wer im Einsatzbuch zur Auswahl steht.",
    ),
    absatz(
      "Ohne Verbindung zu HiOrg läuft die App im Demo-Modus mit erfundenen Personen, damit du den Ablauf ausprobieren kannst.",
    ),
  ],
};

export default notiz;
