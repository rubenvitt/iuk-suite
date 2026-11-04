// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "ehrlich-gesagt-adresse",
  datum: "2026-11-04",
  titel: "Eigene Adresse für Ehrlich gesagt",
  inhalt: [
    absatz(
      "Ehrlich gesagt erreichst du jetzt direkt unter ehrlich-gesagt.iuk-ue.de, auch ohne QR-Code. Unter QR-Code und Aushang zeigen der QR-Code und der Aushang jetzt diese Adresse. Bereits gedruckte Aushänge gelten weiter.",
    ),
  ],
};

export default notiz;
