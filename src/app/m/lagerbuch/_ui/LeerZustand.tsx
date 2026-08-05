import Link from "next/link";
import s from "./helfer.module.css";

/**
 * DER GESTALTETE LEERZUSTAND — Entscheidung 36 (a), §11.7.
 *
 * KEIN "use client": eine Server Component.
 *
 * DREI KONSUMENTEN (E5): `helfer/check/page.tsx` (kein Fahrzeug angelegt),
 * `_ui/CheckFlow.tsx` (Fahrzeug ohne Soll, Geraet und Flasche) und
 * `a/[artikelId]/page.tsx` (Etikett ohne Artikel, Entscheidung 8-C). Dreimal
 * dieselben zwoelf Zeilen waeren dreimal Gelegenheit, den Rueckweg zu
 * vergessen.
 *
 * ⚠️ `weg` IST PFLICHT UND NICHT OPTIONAL. §11.7 stuetzt sich darauf, dass
 * JEDER gestaltete Zustand einen benannten Weg zurueck traegt. Als Optional
 * waere das eine Bitte; als Pflicht-Prop ist es eine Zusage, die `typecheck`
 * durchsetzt.
 *
 * ⚠️ KEIN `notFound()`. Die Suite-404 (`src/app/not-found.tsx`) ersetzt alle
 * Modul-Layouts, traegt Geist statt der Modulschrift und einen antd-`Button`
 * (`:57`). Auf einem Weg, den eine Person MIT EINEM GEDRUCKTEN GEGENSTAND IN
 * DER HAND nimmt, ist das die falsche Antwort: HTTP 200 mit einem Satz, der
 * sagt, was zu tun ist. Vorbild im Haus:
 * `m/files/(oeffentlich-inbox)/u/[token]/page.tsx:13-17`.
 *
 * ⚠️ `weg.href` ist ein AEUSSERER Pfad (`/helfer`, nicht
 * `/m/lagerbuch/helfer`). Der Browser steht auf dem Modul-Host, `decideRoute`
 * praefixiert danach; ein innerer Pfad wuerde doppelt praefixiert (§2.1 g).
 * Diese Komponente fasst den Pfad deshalb NICHT an — sie reicht ihn
 * unveraendert durch, und `rahmen.test.tsx` sichert genau das zu. Ob der
 * uebergebene Pfad ein aeusserer IST, kann nur der Aufrufer zusagen.
 */
export function LeerZustand({
  titel,
  text,
  weg,
}: {
  titel: string;
  text: string;
  weg: { href: string; text: string };
}) {
  return (
    <div className={`${s.karte} ${s.leer}`}>
      <div className={s.zeileName} data-rolle="leer-titel">
        {titel}
      </div>
      <p className={s.fussnote} data-rolle="leer-text">
        {text}
      </p>
      <Link className={`${s.rueckweg} ${s.leerWeg}`} href={weg.href} data-rolle="leer-weg">
        {weg.text}
      </Link>
    </div>
  );
}
