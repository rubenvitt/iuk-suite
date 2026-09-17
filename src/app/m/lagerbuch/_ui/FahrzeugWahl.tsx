import Link from "next/link";
import { einheitLabels, einheitMeta, type Einheitenart } from "../_lib/konstanten";
import { Ikone } from "./ikonen";
import s from "./helfer.module.css";

/**
 * DIE FAHRZEUGWAHL ALS NAVIGATION — §7.9.1, E5.
 *
 * KEIN "use client": eine Server Component mit einem `<Link>` je Fahrzeug.
 * Heute ist die Wahl ein `useState`-Umschalter IN der Client-Komponente
 * (`CheckFlow.tsx:75-87`), und genau das erzwingt, dass ALLE Fahrzeuge im
 * RSC-Payload liegen — mit ihrer Soll-Bestueckung, Geraeteliste, Flaschenliste
 * und Verfallslage, auf einem privaten Telefon (§3.4.5).
 *
 * Als Navigation ist die Wahl ADRESSIERBAR, TEILBAR und im Verlauf
 * ZURUECKNAVIGIERBAR — und die Seite laedt danach nur noch EIN Fahrzeug.
 *
 * EIGENE DATEI STATT INLINE-DEFINITION (E5): inline in `helfer/check/page.tsx`
 * waere sie nur ueber die GANZE Seite testbar, und die braucht eine Datenbank.
 *
 * ⚠️ `href` ist ein AEUSSERER Pfad — derselbe, den `tokenZielPfad` fuer einen
 * Fahrzeug-Code erzeugt (§7.2.5). Ein innerer wuerde auf dem aeusseren Host
 * doppelt praefixiert (Falle 63).
 *
 * ⚠️ KEIN EIGENER LEERZUSTAND. Der Fall „kein Fahrzeug angelegt" gehoert
 * `helfer/check/page.tsx` und wird dort von `_ui/LeerZustand.tsx` getragen —
 * mit dem Rueckweg als Pflicht-Prop (§11.7). Ein zweiter Leerzustand hier waere
 * ein konkurrierender Ausgang.
 */
export function FahrzeugWahl({
  fahrzeuge,
  pfad = "/helfer/check",
}: {
  fahrzeuge: {
    id: string; name: string; kennung: string | null;
    einheitenart: Einheitenart | null;
  }[];
  /**
   * DER SCHIRM, AUF DEN DIE WAHL FUEHRT — DRK-314.
   *
   * ⚠️ EIN PROP UND KEINE ZWEITE DATEI. Der Helfer-Ast hat seit DRK-314 zwei
   * Flaechen, die mit derselben Frage anfangen („aus welcher Einheit?"), und
   * die Zeile darunter ist in beiden dieselbe: Name, Art, Kennung, die ganze
   * Zeile als Bedienflaeche (`einheitMeta`, DRK-309). Eine Kopie daneben liefe
   * beim naechsten Griff an dieser Zeile auseinander — und zwar still, weil
   * beide Flaechen weiter rendern.
   *
   * ⚠️ AEUSSERER PFAD, mit Vorgabewert: ein innerer (`/m/lagerbuch/helfer/…`)
   * wuerde auf dem aeusseren Host doppelt praefixiert (Falle 63). Die Vorgabe
   * haelt die bisherigen Aufrufer unveraendert.
   */
  pfad?: "/helfer/check" | "/helfer/box";
}) {
  const beschriftung = einheitLabels(fahrzeuge);
  return (
    <>
      {/*
        DRK-309: NEUTRAL IM KOPF, DIE ART IN DER ZEILE. Die Überschrift spricht
        über die ganze Liste, und die enthält beides — „Fahrzeug wählen" über
        einer Zeile, die „Sanitätstasche 1" heißt, ist schlicht falsch. Welche
        Art eine EINZELNE Zeile hat, sagt die Zeile selbst.
      */}
      <div className={s.schirmKopf}>Einheit wählen</div>
      {/*
        ⚠️ WARUM HIER ETWAS ZU WAEHLEN IST — DRK-417, und zwar nur auf dem
        Ablegeweg. Seit die Entnahmebox eine eigene Karte hat, ist DIESER Schirm
        das Erste, was jemand nach dem Scan an der Kiste sieht: „Einheit
        wählen" allein beantwortet dort nicht, warum ueberhaupt gefragt wird,
        wenn man doch vor der Box steht. Die Antwort ist die
        Betreiberentscheidung vom 17.09.2026 — ohne Herkunft ist die Umbuchung
        im Journal nicht nachvollziehbar.

        ⚠️ AUF DEM CHECKWEG STEHT HIER NICHTS. Dort ist die Frage von selbst
        beantwortet: man checkt eine Einheit, also waehlt man sie. Ein Satz, der
        Selbstverstaendliches erklaert, wird beim zweiten Mal ueberlesen — und
        beim dritten auch der daneben, der etwas sagt.
      */}
      {pfad === "/helfer/box" && (
        <p className={s.fussnote} data-rolle="wahl-zweck">
          Aus welcher Einheit nimmst du den Überschuss heraus? Das Lagerbuch
          schreibt ihn dort ab und der Entnahmebox zu.
        </p>
      )}
      <div className={s.karte}>
        {/* Kollisionen brauchen die GANZE Liste, nicht die einzelne Zeile. */}
        {fahrzeuge.map((f) => (
          <Link
            className={s.zeile}
            key={f.id}
            // `encodeURIComponent`: nanoid benutzt `-` und `_` und waere
            // unkritisch, aber ein importierter Alt-Bestand kann andere IDs
            // tragen — und ein rohes `?fz=a b` erzeugt eine kaputte URL.
            href={`${pfad}?fz=${encodeURIComponent(f.id)}`}
          >
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{f.name}</div>
              {/*
                DIE META-ZEILE TRAEGT JETZT IMMER ETWAS (DRK-309) — und damit
                faellt der Grund fuer die alte Bedingung weg, nicht die Zusage
                dahinter: ein bedingungsloses Feld war frueher bei fehlender
                Kennung eine LEERE Zeile mit Abstand. Die Art steht immer,
                die Kennung nur, wenn es eine gibt.

                ⚠️ UND SIE IST HIER WICHTIGER ALS IN DER VERWALTUNG: eine
                Tasche traegt kein Kennzeichen, also stand in dieser Zeile fuer
                sie bisher GAR NICHTS — der Name allein musste die Art
                mittragen, und „Rucksack Betreuung" tut das nicht.
              */}
              {/*
                ⚠️ UND WO AUCH DIE ART NICHT TRENNT, TRENNT DIE ID
                (Reviewrunde 16). Zwei Taschen duerfen „Betreuung" heissen und
                beide ohne Kennung sein — dann stuenden hier zwei WOERTLICH
                gleiche Zeilen untereinander, und wer eine antippt, erfaehrt
                nicht, welche er bekommt. Die Wahl gilt danach fuer alle
                weiteren Entnahmen mit diesem Kaertchen.
              */}
              <div className={s.zeileMeta}>
                {beschriftung.get(f.id)?.meta ?? einheitMeta(f)}
              </div>
            </div>
            <Ikone name="chevron-rechts" />
          </Link>
        ))}
      </div>
    </>
  );
}
