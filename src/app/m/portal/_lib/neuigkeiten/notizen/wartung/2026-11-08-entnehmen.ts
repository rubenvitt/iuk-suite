// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "entnehmen",
  datum: "2026-11-08",
  titel: "Material entnehmen und zurücklegen",
  inhalt: [
    absatz(
      "Am QR-Code einer Kiste nimmst du jetzt mit Entnehmen einzelne Teile oder mit Ganze Kiste mitnehmen die ganze Kiste mit und gibst sie mit Zurücklegen zurück. " +
        "Dabei gehst du die Prüfanleitung durch, und was fehlt, wird gemeldet.",
    ),
    absatz("Eine ausgemusterte Akte ohne Verlauf löschst du mit Akte endgültig löschen."),
  ],
};

export default notiz;
