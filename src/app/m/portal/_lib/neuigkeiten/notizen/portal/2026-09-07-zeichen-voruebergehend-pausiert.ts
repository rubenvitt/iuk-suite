import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "zeichen-voruebergehend-pausiert",
  datum: "2026-09-07",
  titel: "Taktische Zeichen ist vorübergehend pausiert",
  inhalt: [
    absatz(
      "Du findest „Taktische Zeichen“ vorerst nicht mehr im Portal und im App-Umschalter. " +
        "Auch über gespeicherte Links kannst du die App während der Pause nicht öffnen.",
    ),
    absatz(
      "Deine auf dem Server gespeicherten eigenen Zeichen, deine Merkliste und dein Lernstand bleiben erhalten. " +
        "Die anderen Apps nutzt du wie bisher.",
    ),
    absatz(
      "Wenn du die App für die Nutzung ohne Netz installiert hast, wird ihr Offline-Speicher " +
        "bei der nächsten Aktualisierung mit Internetverbindung geleert. Dazu gehört auch die Merkliste auf diesem Gerät.",
    ),
  ],
};

export default notiz;
