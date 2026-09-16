import Link from "next/link";
import { einheitMeta, type Einheitenart } from "../_lib/konstanten";
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
  return (
    <>
      {/*
        DRK-309: NEUTRAL IM KOPF, DIE ART IN DER ZEILE. Die Überschrift spricht
        über die ganze Liste, und die enthält beides — „Fahrzeug wählen" über
        einer Zeile, die „Sanitätstasche 1" heißt, ist schlicht falsch. Welche
        Art eine EINZELNE Zeile hat, sagt die Zeile selbst.
      */}
      <div className={s.schirmKopf}>Einheit wählen</div>
      <div className={s.karte}>
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
              <div className={s.zeileMeta}>
                {einheitMeta(f)}
              </div>
            </div>
            <Ikone name="chevron-rechts" />
          </Link>
        ))}
      </div>
    </>
  );
}
