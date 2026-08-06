import Link from "next/link";
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
}: {
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
}) {
  return (
    <>
      <div className={s.schirmKopf}>Fahrzeug wählen</div>
      <div className={s.karte}>
        {fahrzeuge.map((f) => (
          <Link
            className={s.zeile}
            key={f.id}
            // `encodeURIComponent`: nanoid benutzt `-` und `_` und waere
            // unkritisch, aber ein importierter Alt-Bestand kann andere IDs
            // tragen — und ein rohes `?fz=a b` erzeugt eine kaputte URL.
            href={`/helfer/check?fz=${encodeURIComponent(f.id)}`}
          >
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{f.name}</div>
              {/* Die Bedingung ist die Zusage: ein bedingungsloses Meta-Feld
                  waere bei fehlender Kennung eine LEERE Zeile mit Abstand. */}
              {f.kennung && <div className={s.zeileMeta}>{f.kennung}</div>}
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ))}
      </div>
    </>
  );
}
