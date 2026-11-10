import Link from "next/link";
import { SCHRIFT } from "../../../_lib/schrift";

/**
 * IDA-379 — Ein Ort ausserhalb des Handlagers, fertig fuer die Insel: der Link
 * ist auf dem Server aufgeloest (`ortHref`), damit hier nur Skalare ankommen.
 */
export type AussenOrtLink = {
  id: string; name: string; menge: number;
  /** `null` — der Ort hat kein Blatt (`ortHref`); dann steht nur der Name. */
  href: string | null;
};

/**
 * „liegt außerdem in: KTW 1 (6 Stk), Entnahmebox (6 Stk)" — jeder Ort mit
 * Sprung zur Einheit.
 *
 * Steht in der Chargenzeile UND in beiden Rueckfragen (Einzelknopf,
 * Sammelaktion), damit vor dem Bestaetigen auf dem Schirm steht, was NICHT
 * ausgebucht wird: das Aussondern bucht nur den Handlager-Rest, die Packungen
 * draussen bleiben liegen und werden an ihrer Einheit ausgesondert.
 *
 * ⚠️ OHNE "use client" UND OHNE HOOK: sie wird nur aus Client-Inseln gerendert
 * und braucht selbst keine. Text statt Chips — dieselbe Begruendung wie bei
 * den Liegeplaetzen (`HandlagerVerfallTabelle`, IDA-238): ein Chip bricht
 * nicht um und lief auf dem Telefon ueber den Kartenrand.
 */
export function AussenOrte({
  orte,
  einheit,
  auftakt = "liegt außerdem in",
}: {
  orte: AussenOrtLink[];
  einheit: string;
  auftakt?: string;
}) {
  if (orte.length === 0) return null;
  return (
    <span data-rolle="aussen-orte" style={{ ...SCHRIFT.neben, overflowWrap: "anywhere" }}>
      {auftakt}:{" "}
      {orte.map((ort, i) => (
        <span key={ort.id}>
          {i > 0 ? ", " : null}
          {ort.href ? <Link href={ort.href}>{ort.name}</Link> : ort.name}
          {` (${ort.menge} ${einheit})`}
        </span>
      ))}
    </span>
  );
}
