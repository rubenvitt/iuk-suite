// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "maengel-melden",
  datum: "2026-10-31",
  titel: "Mängel melden",
  inhalt: [
    absatz(
      "Ist an einem Schrank, Fahrzeug oder einer Tasche etwas kaputt, scannst du das Ortsetikett und tippst unten auf Mangel. " +
        "Dort kreuzt du an, was los ist, und hängst bei Bedarf Fotos an. " +
        "Die Verwaltung findet die Meldungen unter Verwaltung → Mängel und bekommt einen Push, wenn sie „Was steht an“ abonniert hat.",
    ),
  ],
};

export default notiz;
