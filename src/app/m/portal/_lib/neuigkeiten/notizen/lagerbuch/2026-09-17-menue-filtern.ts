// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT, obwohl die meisten Änderungen keine bekommen:
 * es ist die zweite Zeile der Probe — etwas KANN VERSCHWINDEN. Wer einen
 * Abschnitt zuklappt, findet die Einträge darunter nicht mehr an ihrem Platz,
 * und ohne diesen Absatz wäre der erste Gedanke „da fehlt etwas" statt „das
 * habe ich selbst zugeklappt".
 *
 * ⚠️ KEIN `hinweis`. Ein Hinweis ist eine Aufforderung, und hier ist nichts zu
 * tun: wer nichts anfasst, sieht dasselbe Menü wie gestern.
 *
 * ⚠️ EIN ABSATZ, KEINE ZWEI — obwohl hier zwei Griffe beschrieben sind. Sie
 * gehören zu EINER Änderung: das Menü ist lang geworden. Zwei Absätze daraus zu
 * machen hieße zu behaupten, man könne das eine ohne das andere haben.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "menue-filtern",
  datum: "2026-09-17",
  titel: "Das Menü der Verwaltung lässt sich filtern",
  inhalt: [
    absatz(
      "Über dem Menü der Verwaltung steht jetzt ein Feld „Menü filtern“ — tipp ein paar " +
        "Buchstaben, und nur die passenden Einträge bleiben stehen. Die Überschriften " +
        "darin kannst du anklicken: ein Klick klappt den Abschnitt zu, ein zweiter " +
        "wieder auf. Zugeklappt bleibt er, bis du eine Seite daraus aufrufst.",
    ),
  ],
};

export default notiz;
