/**
 * Der Schreibweg fuer `lagerort_verfall` — die Kompensation aus §4.11.
 *
 * Kein "use client". Laeuft transaktions-FREI und damit auch INNERHALB des
 * Check-Abschlusses (Festlegung H3).
 *
 * ⚠️ NUR DIE SCHREIBWEGE LIEGEN HIER. Der Leser `verfallFuerLagerort` liegt in
 * `_lib/lesepfade/verfall.ts` (Festlegung H4), obwohl die Alt-Anwendung beides in
 * `db/lagerort-verfall.ts` fuehrt.
 *
 * ⚠️ DIE ZUGEHOERIGKEITSPRUEFUNG LIEGT NICHT HIER. „Der Artikel muss an diesem
 * Lagerort im Soll stehen" prueft die AUFRUFENDE Action
 * (`lagerort-verfall.ts:30-36`, `check.ts:153-155`) — Teil 4 bzw. Teil 5. Der
 * eigene Client erzeugt die verletzende Eingabe nie, ein manipulierter Request
 * schon; die Auflage steht in der Abgabetabelle.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerortVerfall, newId } from "../../_db/schema";
import { MONAT_REGEX } from "../konstanten";
import type { Quelle, Tx } from "./abbuchung";

/**
 * Setzt den gemeldeten Verfall fuer (Lagerort, Artikel).
 *
 * ⚠️ `verfall = null` ODER `""` LOESCHT die Angabe wieder — sie ist ueberall
 * optional, und ein leerer Wert ist eine Ruecknahme, kein Fehler.
 *
 * ⚠️ DER UPSERT UEBERSCHREIBT, UND DIE ALTE ANGABE IST DANACH WEG.
 * `lagerort_verfall` hat KEINE Historie und KEINEN Trigger (§4.4, §4.11). Das ist
 * gewollt: ein Fahrzeug hat EINEN aktuellen fruehesten Verfall, keine
 * Verlaufskurve. Wer hier eine Historie einzieht, aendert die Tabellensemantik.
 *
 * ⚠️ GENAU EIN MONATSVALIDATOR (§5.6.4, Entscheidung 6): `MONAT_REGEX` aus
 * `_lib/konstanten.ts`, NICHT der laxe `/^\d{4}-\d{2}$/` aus `buchung.ts:17` und
 * `bz.ts:83`. „2026-00" passiert den laxen; `verfallStatus` rechnet daraus den
 * 31.12.2025, und die Charge gilt AB DEM ANLEGEN als abgelaufen.
 */
export function setzeVerfall(
  db: DB | Tx,
  args: {
    lagerortId: string; artikelId: string; verfall: string | null;
    quelle: Quelle; jetzt?: Date;
  },
): void {
  const { lagerortId, artikelId, verfall, quelle, jetzt = new Date() } = args;
  if (!verfall) {
    loescheVerfallEintrag(db, lagerortId, artikelId);
    return;
  }
  if (!MONAT_REGEX.test(verfall)) {
    throw new Error(`Verfall muss das Format YYYY-MM haben (Monat 01–12), war: "${verfall}"`);
  }
  db.insert(lagerortVerfall)
    .values({
      id: newId(), lagerortId, artikelId, verfall, erfasstAt: jetzt,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
    })
    // ⚠️ `onConflictDoUpdate` und NICHT `INSERT OR REPLACE`: letzteres LOESCHT die
    // Zeile und legt sie NEU an (andere `id`, potenziell FK-Kaskaden und
    // Trigger-Feuer). Auf DIESER Tabelle gibt es keinen Trigger, aber das Idiom
    // soll im Modul einheitlich bleiben (Teil 1, Global Constraints).
    .onConflictDoUpdate({
      target: [lagerortVerfall.lagerortId, lagerortVerfall.artikelId],
      set: {
        verfall, erfasstAt: jetzt,
        quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      },
    })
    .run();
}

/** Entfernt genau EINE Angabe — z. B. wenn der Artikel an diesem Lagerort aus dem
 *  Soll fliegt (`fahrzeuge.ts:80`). Auf einer nicht vorhandenen Zeile ein No-Op. */
export function loescheVerfallEintrag(
  db: DB | Tx, lagerortId: string, artikelId: string,
): void {
  db.delete(lagerortVerfall)
    .where(and(
      eq(lagerortVerfall.lagerortId, lagerortId),
      eq(lagerortVerfall.artikelId, artikelId),
    ))
    .run();
}

/** Raeumt alle Meldungen eines Lagerorts bzw. Artikels ab — vor einem
 *  Hard-Delete (Teil 5, §5.21). */
export function loescheVerfallFuer(
  db: DB | Tx, feld: "lagerort" | "artikel", id: string,
): void {
  const wo = feld === "lagerort"
    ? eq(lagerortVerfall.lagerortId, id)
    : eq(lagerortVerfall.artikelId, id);
  db.delete(lagerortVerfall).where(wo).run();
}
