/**
 * FREITEXT IN EINER TABELLENZELLE — auf eine Lesebreite gedeckelt (DRK-372).
 *
 * ⚠️ DAS SYMPTOM FÜHRT IN DIE IRRE: die Zeile sieht richtig aus, sie steht nur
 * sehr weit rechts. Die Tabellen der Suite fahren `scroll={{ x: "max-content" }}`
 * (`core/tabelle/masse.ts`), sind also so breit, wie es die BREITESTE Zelle
 * verlangt. Ein Kommentar, eine Bemerkung, eine Notiz sind Nachweisfelder ohne
 * Längengrenze — EIN langer Satz aus dem Altbestand schiebt damit alle Spalten
 * dahinter aus dem Bild, und niemand sieht die Ursache.
 *
 * WARUM SIE NACH `core` DURFTE: nicht als Vorrat, sondern gegen eine bereits
 * eingetretene Verdopplung. `lagerbuch` deckelte seit DRK-311 mit `.zellentext`
 * in `_ui/verwaltung.module.css`, `files` seit dem Posteingang mit
 * `.hinweistext` in `_ui/posteingang.module.css` — zwei Klassen, zwei Breiten
 * (320px und 32ch), und die zweite wirkte in der Tabelle gar nicht (s. u.).
 * `radio` zeigt dieselbe Notiz ungedeckelt. Damit ist der Maßstab aus
 * `CLAUDE.md` erfüllt: ein zweites, heute belegbares Modul.
 *
 * ⚠️ GEDECKELT WIRD DIE ANZEIGE, NIE DER NACHWEIS. Der volle Text bleibt in der
 * Datenbank und muss an einer Stelle ungekürzt LESBAR sein — deshalb ist die
 * Vorgabe hier die reine Breitendeckelung, bei der nichts verschwindet, und
 * `zeilen` die ausdrückliche Ausnahme für eine Übersicht, hinter der die
 * Nachweisfläche einen Klick entfernt liegt. Wer `zeilen` auf eine Nachweisfläche
 * setzt, nimmt genau das weg, wofür sie da ist.
 *
 * ⚠️ NICHT `ellipsis: true` AN DER SPALTE — die Begründung steht im Kopf von
 * `zellentext.module.css`, zusammen mit der Antwort auf „warum reicht
 * `max-width` allein nicht?".
 */

import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import stil from "./zellentext.module.css";

export type ZellentextProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  /** Der volle Text. Er steht im DOM, auch wenn `zeilen` ihn optisch kürzt. */
  text: string;
  /**
   * Zusätzlich auf so viele Zeilen kürzen. Nur für ÜBERSICHTEN — auf einer
   * Nachweisfläche deckelt allein die Breite (Begründung oben).
   */
  zeilen?: number;
};

export function Zellentext({ text, zeilen, className, style, title, ...rest }: ZellentextProps) {
  const klassen = [stil.zellentext, zeilen ? stil.gekuerzt : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      {...rest}
      // Der GRIFF FÜR TESTS. Ein Klassenname aus einem CSS-Modul ist gehasht und
      // je nach Testumgebung etwas anderes; dieses Merkmal ist in jeder dasselbe.
      data-zellentext=""
      data-gekuerzt={zeilen ? "" : undefined}
      className={klassen}
      /*
       * ⚠️ DER `title` HÄNGT AN `zeilen`, NICHT AN DER KOMPONENTE. Ohne Kürzung
       * steht der ganze Satz ohnehin da; ein `title`, der ihn wiederholt, wäre
       * für eine Vorleseanwendung eine zweite Stimme auf denselben Text. Ein
       * eigener `title` des Aufrufers gewinnt.
       */
      title={title ?? (zeilen ? text : undefined)}
      style={zeilen
        ? ({ ...style, "--zellentext-zeilen": zeilen } as CSSProperties)
        : style}
    >
      {text}
    </span>
  );
}
