/**
 * DIE CHARGE FUER EIN VON DER PACKUNG ABGELESENES DATUM — DRK-404.
 *
 * Kein "use client", transaktionsFREI (Festlegung H3).
 *
 * Beim Einraeumen aus der Entnahmebox fragt die Flaeche nach dem Datum, wenn
 * die Box fuer den Artikel einen Verfall meldet und die gewaehlte Charge ihn
 * nicht traegt. Die Person liest ein DATUM ab, keine Chargennummer — das
 * Material bekommt im Schrank deshalb eine Charge, deren Nummer genau das sagt
 * (`CHARGE_ABGELESEN`).
 *
 * ⚠️ WIEDERVERWENDET WIRD NUR EINE EIGENE „abgelesen"-CHARGE, NIE EINE ECHTE
 * MIT GLEICHEM DATUM. Eine echte Charge traegt eine Nummer von einer Packung;
 * Material ohne diese Nummer darauf zu buchen behauptete eine Herkunft, die
 * niemand gesehen hat — im Rueckruffall die falsche Auskunft. Ohne
 * Wiederverwendung entstuende dagegen je Einraeumen eine neue Zeile gleichen
 * Inhalts, und die Chargenliste des Artikels liefe voll.
 *
 * ⚠️ `PSEUDO_VERFALL` WIRD ABGEWIESEN: ein abgelesenes „bis 12/99" ist kein
 * Datum, sondern die Kodierung fuer „keins" — die Charge sagte danach dasselbe
 * wie die Pseudo-Charge, die sie ersetzen soll, nur mit anderer Nummer.
 */
import { and, asc, eq } from "drizzle-orm";
import { chargen, newId } from "../../_db/schema";
import { CHARGE_ABGELESEN, MONAT_REGEX, istOhneVerfall } from "../konstanten";
import type { Tx } from "./abbuchung";

export function abgeleseneCharge(tx: Tx, artikelId: string, verfall: string): string {
  if (!MONAT_REGEX.test(verfall) || istOhneVerfall(verfall)) {
    throw new Error(`Abgelesener Verfall muss ein echter Monat sein, war: "${verfall}"`);
  }
  const vorhanden = tx.select({ id: chargen.id }).from(chargen)
    .where(and(
      eq(chargen.artikelId, artikelId),
      eq(chargen.chargenNr, CHARGE_ABGELESEN),
      eq(chargen.verfall, verfall),
    ))
    // Kein Unique-Index auf chargen (`_db/schema.ts`) — die aelteste gewinnt,
    // damit zwei Laeufe dieselbe Zeile finden.
    .orderBy(asc(chargen.createdAt), asc(chargen.id))
    .get();
  if (vorhanden) return vorhanden.id;

  const id = newId();
  tx.insert(chargen).values({
    id, artikelId, chargenNr: CHARGE_ABGELESEN, verfall, createdAt: new Date(),
  }).run();
  return id;
}
