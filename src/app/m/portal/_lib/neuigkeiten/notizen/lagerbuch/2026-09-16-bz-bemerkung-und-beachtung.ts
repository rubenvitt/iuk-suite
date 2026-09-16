// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "bz-bemerkung-und-beachtung",
  datum: "2026-09-16",
  titel: "Hinweise an BZ-Geräten",
  inhalt: [
    absatz(
      "Unter „Verwaltung → BZ-Kontrolle“ steht jetzt die Bemerkung der letzten Kontrolle " +
        "in der Liste. Daneben kannst du ein Gerät als „Beachtung nötig“ markieren: es " +
        "bekommt einen gelben Hinweis mit deinem Text, nach dem du auch filtern kannst.",
    ),
    absatz(
      "Die Markierung setzt du beim Erfassen einer Kontrolle oder direkt auf dem " +
        "Geräteblatt; dort hebst du sie auch wieder auf. Eine Bemerkung allein löst sie " +
        "nicht aus — nur was du selbst markierst, wird gelb.",
    ),
  ],
};

export default notiz;
