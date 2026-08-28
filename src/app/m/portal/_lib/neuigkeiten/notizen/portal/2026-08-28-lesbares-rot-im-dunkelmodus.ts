// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "lesbares-rot-im-dunkelmodus",
  datum: "2026-08-28",
  titel: "Rote Schrift ist im Dunkelmodus wieder lesbar",
  inhalt: [
    absatz(
      "Links, Fehlermeldungen unter Formularfeldern und rote Knöpfe wie „Löschen“ stehen im " +
        "Dunkelmodus jetzt in einem helleren Rot. Bisher war es dasselbe dunkle Rot wie auf " +
        "weißem Grund, und auf einer schwarzen Fläche war es kaum vom Hintergrund zu " +
        "unterscheiden — am deutlichsten in der Geräteliste der Funkverwaltung.",
    ),
    absatz(
      "Das gilt in allen Apps zugleich, weil die Farbe an einer Stelle festgelegt ist. Gefüllte " +
        "rote Knöpfe mit weißer Schrift bleiben, wie sie sind: dort ist das dunklere Rot der " +
        "Grund, auf dem die weiße Schrift lesbar bleibt.",
    ),
    absatz("Im hellen Modus ändert sich nichts."),
  ],
};

export default notiz;
