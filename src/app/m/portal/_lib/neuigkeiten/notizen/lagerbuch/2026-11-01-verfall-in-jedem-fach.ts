// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "verfall-in-jedem-fach",
  datum: "2026-11-01",
  titel: "Verfall in jedem Fach angeben",
  inhalt: [
    absatz(
      "Im Fahrzeug-Check findest du „Verfall angeben“ jetzt in jeder Zeile, auch wenn ein Artikel in mehreren " +
        "Fächern liegt. Das Datum gilt für den Artikel im ganzen Fahrzeug: trag das früheste ein, das du findest.",
    ),
  ],
};

export default notiz;
