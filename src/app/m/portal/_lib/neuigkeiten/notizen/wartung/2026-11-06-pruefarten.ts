// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "pruefarten",
  datum: "2026-11-06",
  titel: "Prüfarten einmal pflegen, je Gerät anpassen",
  inhalt: [
    absatz(
      "Prüfungen wie die Elektroprüfung pflegst du jetzt einmal unter Prüfarten, mit Intervall und wer sie erledigt. " +
        "Unter Gerätearten hakst du an, welche Prüfarten jedes Gerät der Art hat. " +
        "In der Akte eines Geräts wählst du unter Prüfungen mit Anpassen eine davon ab, nimmst eine weitere dazu oder setzt ein eigenes Intervall.",
    ),
  ],
};

export default notiz;
