// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT — und die naheliegende Begründung ist wieder die
 * falsche. „Ein Anzeigefehler ist behoben" wäre keine (die Tabelle in CLAUDE.md
 * führt den behobenen Fehler rechts). Die Probe trifft, weil die Liste etwas
 * WEGNIMMT: wer einen laufenden Check gewohnt war, findet ihn in der Übersicht
 * nicht mehr. Damit ist es „eine Änderung, nach der jemand vergeblich sucht",
 * und die ist laut CLAUDE.md nicht verhandelbar.
 *
 * ⚠️ DER WEG ZURÜCK STEHT MIT DEN WÖRTERN DA, DIE AUF DEM BILDSCHIRM STEHEN
 * („Laufende Checks zeigen"). Eine Notiz, die sagt, dass etwas verschwunden
 * ist, ohne zu sagen, wie man es wiederbekommt, macht die Sucherei schlimmer
 * statt besser.
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun — wer nichts ändert, sieht künftig eine Liste, die hält, was ihr Titel
 * sagt.
 *
 * ⚠️ WAS DRAUSSEN BLEIBT, obwohl es die Änderung überhaupt ausgelöst hat: dass
 * solche Checks aus dem Datenimport der alten Anwendung stammen, und dass die
 * Detailseite vorher „0 Positionen" zeigte. Das erste ist Vorgeschichte, das
 * zweite die Begründung der Entscheidung — beides fällt nach der Stilregel als
 * Erstes weg. Für den Leser zählt, was er sieht und wo er es findet.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "checks-laufend",
  datum: "2026-09-19",
  titel: "Laufende Checks stehen nicht mehr zwischen den fertigen",
  inhalt: [
    absatz(
      "Die Übersicht „Checks an Fahrzeugen und Taschen“ zeigt nur noch abgeschlossene " +
        "Checks. Ein Check, an dem noch kein Ergebnis erfasst wurde, stand dort bisher " +
        "mit einem Strich statt einer Uhrzeit und war von einem fertigen kaum zu " +
        "unterscheiden. Über „Laufende Checks zeigen“ holst du ihn zurück in die Liste.",
    ),
    absatz(
      "Öffnest du einen solchen Check, steht jetzt oben, dass er noch läuft. Vorher sah " +
        "er aus wie ein Check, bei dem nichts zu tun war.",
    ),
  ],
};

export default notiz;
