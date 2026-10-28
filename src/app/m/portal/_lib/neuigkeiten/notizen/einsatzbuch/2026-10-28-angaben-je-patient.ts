// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "angaben-je-patient",
  datum: "2026-10-28",
  titel: "Einsatznummer und Transport je Patient",
  inhalt: [
    absatz(
      "Unter „Patienten“ bekommt jetzt jeder gezählte Patient eine eigene Zeile. " +
        "Dort trägst du die Einsatznummer ein und bei „Behandelt mit Transport“ auch, wer transportiert hat; beides ist freiwillig und steht danach im Einsatz und im Bericht.",
    ),
  ],
};

export default notiz;
