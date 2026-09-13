// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "zeichen-voruebergehend-pausiert",
  datum: "2026-09-07",
  titel: "Taktische Zeichen ist pausiert",
  inhalt: [
    absatz(
      "„Taktische Zeichen“ findest du vorerst nicht mehr im Portal, und auch gespeicherte Links " +
        "öffnen die App während der Pause nicht. Deine eigenen Zeichen, deine Merkliste und dein " +
        "Lernstand bleiben auf dem Server erhalten.",
    ),
    absatz(
      "Hast du die App für die Nutzung ohne Netz eingerichtet, wird ihr Speicher auf dem Gerät " +
        "bei der nächsten Aktualisierung mit Verbindung geleert.",
    ),
  ],
};

export default notiz;
