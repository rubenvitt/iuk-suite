// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "entnehmen",
  datum: "2026-11-08",
  titel: "Material entnehmen und zurücklegen",
  inhalt: [
    absatz(
      "Am QR-Code einer Kiste nimmst du mit Entnehmen Teile oder mit Ganze Kiste mitnehmen alles mit, mit Zurücklegen gibst du es zurück. " +
        "Wird eingesetzt tippst du nur noch an Geräten, dann siehst du dort, seit wann und bei wem. " +
        "Ausgemusterte Akten ohne Verlauf löschst du mit Akte endgültig löschen.",
    ),
  ],
};

export default notiz;
