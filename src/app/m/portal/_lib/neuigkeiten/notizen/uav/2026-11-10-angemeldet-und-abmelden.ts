// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "angemeldet-und-abmelden",
  datum: "2026-11-10",
  titel: "Du siehst, wer angemeldet ist, und kannst dich abmelden",
  inhalt: [
    absatz(
      "Oben steht jetzt „Angemeldet als …“ mit deinem Namen, daneben „Abmelden“ — so trägt auf einem " +
        "geteilten Gerät niemand unter deinem Namen ein. Eine Durchführung braucht einen Drohnensteuerer, " +
        "vorbelegt ist dein Name. Die Zielanzahl legt die Ausbildung fest; du siehst sie, änderst sie aber nicht mehr.",
    ),
  ],
};

export default notiz;
