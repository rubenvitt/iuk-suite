import { dieseEinheit, einheitLabels, type Einheitenart } from "../_lib/konstanten";
import { Ikone } from "./ikonen";
import s from "./helfer.module.css";

/**
 * „DEIN SCAN GILT HIER NICHT" — DRK-373.
 *
 * KEIN "use client": eine Server Component, kein antd (§7.1). Sie steht auf dem
 * oeffentlichen Ast, den `_lib/bauform.test.ts` antd-frei haelt — `Ikone` ist
 * `react-icons`, nicht `@ant-design/icons` (Falle 7).
 *
 * DER FALL, DEN SIE SICHTBAR MACHT: jemand mit einem auf Einheit A gebundenen
 * Kaertchen scannt das Ortsetikett von Einheit B. Die Bindung gewinnt
 * (DRK-302 / DRK-312, Begruendung an `_lib/ortZiel.ts`) — bis hierher erfuhr die
 * Person das nur daran, dass in der Ueberschrift ein anderer Name stand als auf
 * dem Etikett in ihrer Hand. Bei „RTW 1" neben „RTW 2" merkt das im Zweifel
 * niemand, und gezaehlt wuerde der Inhalt der einen Einheit in das Buch der
 * anderen.
 *
 * ⚠️ EIN HINWEIS UND KEINE SACKGASSE, und das ist eine Entscheidung gegen die
 * naheliegende Alternative „Zwischenschirm mit Weiterknopf". Drei Gruende, alle
 * schon im Haus aufgeschrieben: `o/[ortId]/page.tsx` haelt fest, dass ein
 * Zwischenschirm „ein Klick ist, den niemand bestellt hat"; die Bindung ist
 * eine ANZEIGE-Entscheidung und kein Riegel (`helfer/check/page.tsx`), eine
 * Sackgasse machte sie faktisch zu einem und beantwortete die offene
 * Betreiberfrage 5 („wie sind die Kaertchen physisch verteilt?") im
 * Vorbeigehen; und wer im Fahrzeug steht, braucht seinen Check, nicht eine
 * Bestaetigungsseite. Der Check laeuft also weiter — er sagt nur, mit welcher
 * Einheit.
 *
 * ⚠️ UND ER NENNT KEINEN AUSWEG, obwohl die Frage „wie komme ich dann an B?"
 * naheliegt. Jede Antwort darauf („nimm das Kaertchen, das an B haengt")
 * BEHAUPTET die physische Verteilung der Kaertchen — genau die offene
 * Betreiberfrage. Ein Satz, der sie nicht kennt, ist besser als einer, der sie
 * raet.
 *
 * ⚠️ BEIDE EINHEITEN WERDEN UEBER `einheitLabels` BENANNT, NICHT UEBER `name`
 * (DRK-309, Reviewrunde 16). Zwei Einheiten duerfen woertlich gleich heissen
 * und beide ohne Kennung sein — `lagerorte.name` traegt fuer Einheiten keinen
 * Eindeutigkeitsschluessel. Dann stuende hier „Gescannt hast du RTW, dein
 * Kaertchen ist auf RTW ausgestellt", und der Hinweis waere schlimmer als
 * keiner: er behauptet einen Unterschied, den er nicht zeigt. `einheitLabels`
 * haengt im Kollisionsfall die Id an — haesslich, aber genau dort, wo
 * Unterscheidbarkeit mehr wert ist als Schoenheit.
 *
 * ⚠️ DIE KOLLISION WIRD UEBER DIE ZWEI EINHEITEN GERECHNET, nicht ueber die
 * ganze Fahrzeugliste. Hier zaehlt allein, dass DIESE ZWEI auseinanderzuhalten
 * sind; eine dritte gleichnamige Einheit, von der dieser Satz nicht spricht,
 * wuerde den beiden sonst eine Id anhaengen, die nichts erklaert.
 *
 * ⚠️ KEIN ROT (Falle 3). Auf der Check-Flaeche traegt Rot die Verfallsbedeutung
 * — ein roter Kasten ueber der Zaehlliste laese sich als „hier ist etwas
 * abgelaufen". Der Warnton `--lb-gelb` steht neben, nicht in der
 * Verfalls-Ampel (`--lb-ampel-gelb-*`): die Kante faerbt, die Flaeche bleibt
 * Karte. Die Regel dazu steht in `docs/design/README.md` („Warnungen sind
 * `type="warning"` oder Text plus 3px linke Kante"). Die UEBERSCHRIFT traegt
 * den Warnton NICHT — im hellen Modus unterschreitet er dort den Textkontrast;
 * die Messung steht am Stylesheet.
 */
export function ScanHinweis({
  gescannt,
  gezeigt,
}: {
  /**
   * Die Einheit, deren Etikett gescannt wurde — die, die NICHT gilt.
   *
   * ⚠️ BEIDE ANGABEN SIND PFLICHT-PROPS, KEINE OPTIONALS, und die Begruendung
   * ist dieselbe wie bei `LeerZustand.weg` und `CheckFlow.gebunden`: als
   * Optional waere „nenne beide Einheiten beim Namen" eine Bitte, als Pflicht
   * ist es eine Zusage, die `typecheck` durchsetzt. Der halbe Hinweis
   * („dein Scan gilt hier nicht" ohne zu sagen, was stattdessen gilt) ist der
   * teuerste Ausgang dieser Datei.
   */
  gescannt: EinheitAngabe;
  /** Die gebundene Einheit, die der Check zeigt. */
  gezeigt: EinheitAngabe;
}) {
  const beschriftung = einheitLabels([gescannt, gezeigt]);
  const label = (e: EinheitAngabe) =>
    beschriftung.get(e.id)?.label ?? e.name;

  return (
    <div className={`${s.karte} ${s.scanHinweis}`} data-rolle="scan-hinweis">
      <div className={s.scanHinweisKopf}>
        {/*
          ⚠️ DER TRAEGER DER FARBE IST DIESER `span`, NICHT DIE UEBERSCHRIFT.
          `Ikone` nimmt keine Klasse und faerbt ueber `currentColor` — der
          Warnton muss also von einem Elternelement kommen. Von der
          Ueberschrift darf er es nicht: dort unterschreitet er im hellen Modus
          den Textkontrast (die Messung steht am Stylesheet).
        */}
        <span className={s.scanHinweisZeichen}>
          <Ikone name="warnung" />
        </span>
        Dein Scan gilt hier nicht
      </div>
      <p className={s.fussnote} data-rolle="scan-hinweis-text">
        {/*
          ZWEI SAETZE, UND DER ZWEITE IST DER, DEN DAS TICKET VERLANGT: „warum
          zeigt der Check trotzdem die gebundene?". Ohne ihn liest sich der
          Hinweis wie ein Fehler der Anwendung statt wie die Regel, die er ist.

          ⚠️ DER SCHLUSS NENNT KEINEN NAMEN MEHR, SONDERN ZEIGT AUF DEN EBEN
          GENANNTEN. Hier stand „… geprueft wird hier also {gezeigt.name}" —
          der BLOSSE Name, und der macht genau im Kollisionsfall die
          Unterscheidung wieder zunichte, fuer die `einheitLabels` zwei Zeilen
          darueber eine Id anhaengt („geprueft wird hier also Betreuung", waehrend
          beide Einheiten so heissen). Die volle Beschriftung ein drittes Mal
          waere der andere Ausweg und macht den Satz unlesbar;
          `dieseEinheit` zeigt auf die zuletzt genannte und traegt dabei die
          richtige Art (DRK-309: „dieses Fahrzeug" / „diese Tasche").
        */}
        Gescannt hast du das Etikett von „{label(gescannt)}“. Dein Kärtchen gilt
        aber, und es ist auf „{label(gezeigt)}“ ausgestellt — geprüft wird hier
        also {dieseEinheit(gezeigt.einheitenart)}.
      </p>
    </div>
  );
}

/**
 * Genau die Felder, aus denen `einheitLabels` eine eindeutige Beschriftung
 * baut. `id` gehoert dazu, weil sie im Kollisionsfall Teil der Beschriftung
 * wird — und weil sie der Schluessel der Map ist.
 */
type EinheitAngabe = {
  id: string;
  name: string;
  kennung: string | null;
  einheitenart: Einheitenart | null;
};
