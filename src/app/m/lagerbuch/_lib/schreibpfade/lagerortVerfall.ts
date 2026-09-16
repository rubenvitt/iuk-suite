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
 *
 * ⚠️ UND SIE IST SEIT DRK-377 EINE AUFLAGE DES EDITORS, KEINE DER TABELLE.
 * Wer den Satz „ohne Soll kein Verfall" als Invariante der TABELLE liest, baut
 * die Luecke wieder ein, an der DRK-377 haengt: die Entnahmebox hat kein Soll
 * und muss trotzdem einen gemeldeten Verfall tragen koennen. Gebunden ist die
 * Pflege — wer von Hand ein Datum eintraegt, tut das an einem Artikel, der an
 * dieser Einheit im Soll steht —, nicht die Zeile. Die Begruendung im Langen
 * steht an `bereinigeVerfallOhneAktivesSoll` unten.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerorte, lagerortVerfall, newId, sollPositionen } from "../../_db/schema";
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

/**
 * Uebernimmt den gemeldeten Verfall eines Artikels von EINEM Ort an einen
 * ANDEREN — die Angabe wandert mit dem Material (DRK-377).
 *
 * ⚠️ SIE WANDERT ALS GANZES, MIT `erfasstAt` UND QUELLE. Eine Meldung ist die
 * Aussage eines Menschen ueber ein Datum, das er auf einer Packung gelesen hat;
 * beim Umraeumen beschreibt sie einen anderen Ort, aber sie bleibt DIESELBE
 * Meldung. Stempelte dieser Weg „jetzt" und den Umbuchenden darauf, stuende in
 * der Verfallsuebersicht unter „Gemeldet" der heutige Tag — eine Messung, die
 * so nie stattgefunden hat, und genau der Fehler, den DRK-377 an Weg 3
 * ausdruecklich verworfen hat.
 *
 * ⚠️ BEI ZWEI HERKUENFTEN GEWINNT DAS FRUEHERE DATUM (Betreiberentscheidung zu
 * DRK-377). Der Zielort traegt je Artikel genau EINEN Wert (Unique-Index), und
 * die Tabelle bedeutet „das frueheste Datum, das an diesem Ort auf einer
 * Packung steht" — zwei Einheiten, die denselben Artikel in dieselbe Kiste
 * geben, ergeben also keine zwei Zeilen, sondern die fruehere. Die sichere
 * Richtung: die Kiste warnt eher zu frueh als zu spaet. Der Preis ist benannt
 * und eng — das spaetere Datum der zweiten Herkunft ist danach nicht mehr zu
 * sehen.
 *
 * ⚠️ DER VERGLEICH LAEUFT UEBER DIE ZEICHENKETTE, UND DAS IST KEIN ZUFALL:
 * "YYYY-MM" ist lexikografisch dieselbe Ordnung wie chronologisch, erzwungen
 * von `MONAT_REGEX` an jedem Schreibweg. Wer das Format aufweicht (zweistellige
 * Jahre, ein anderes Trennzeichen), macht diese Zeile still falsch.
 *
 * ⚠️ OHNE ZEILE AM QUELLORT PASSIERT NICHTS — insbesondere wird am Zielort
 * NICHTS GELOESCHT. Material ohne gemeldeten Verfall dazuzulegen sagt nichts
 * darueber aus, was schon in der Kiste liegt.
 */
export function uebernimmVerfall(
  db: DB | Tx,
  args: { vonLagerortId: string; nachLagerortId: string; artikelId: string },
): void {
  const { vonLagerortId, nachLagerortId, artikelId } = args;
  const quellZeile = db.select().from(lagerortVerfall)
    .where(and(
      eq(lagerortVerfall.lagerortId, vonLagerortId),
      eq(lagerortVerfall.artikelId, artikelId),
    ))
    .get();
  if (!quellZeile) return;

  const zielZeile = db.select({ verfall: lagerortVerfall.verfall })
    .from(lagerortVerfall)
    .where(and(
      eq(lagerortVerfall.lagerortId, nachLagerortId),
      eq(lagerortVerfall.artikelId, artikelId),
    ))
    .get();
  if (zielZeile && zielZeile.verfall <= quellZeile.verfall) return;

  db.insert(lagerortVerfall)
    .values({
      id: newId(), lagerortId: nachLagerortId, artikelId,
      verfall: quellZeile.verfall, erfasstAt: quellZeile.erfasstAt,
      quelleTyp: quellZeile.quelleTyp, quelleId: quellZeile.quelleId,
    })
    .onConflictDoUpdate({
      target: [lagerortVerfall.lagerortId, lagerortVerfall.artikelId],
      set: {
        verfall: quellZeile.verfall, erfasstAt: quellZeile.erfasstAt,
        quelleTyp: quellZeile.quelleTyp, quelleId: quellZeile.quelleId,
      },
    })
    .run();
}

/**
 * Hält die Querschnittsinvariante zwischen Soll-Bestückung und Fahrzeug-Verfall:
 * ohne mindestens eine aktive Sollposition gibt es keinen pflegbaren Verfall.
 *
 * Der Helfer läuft absichtlich nach einer Soll-Mutation und nimmt `DB | Tx`,
 * damit Vorlagen-Sync und Actions dieselbe atomare Prüfung verwenden. Eine
 * weitere aktive Position desselben Artikels erhält die Angabe.
 *
 * ⚠️ UND ER GILT NUR FUER EINHEITEN — DAS IST DIE ENTKOPPLUNG AUS DRK-377.
 * Bis dahin galt „ohne Soll kein Verfall" fuer die ganze Tabelle, und daran
 * scheiterte die Entnahmebox: sie hat ausdruecklich KEIN Soll
 * (`_lib/konstanten.ts`) und konnte deshalb keinen gemeldeten Verfall tragen —
 * eine Meldung ging beim Umbuchen entweder verloren oder blieb an einer leeren
 * Einheit stehen. Seither gilt der Satz dort, wo er etwas bedeutet: an einer
 * Einheit begruendet das Soll die Zugehoerigkeit eines Artikels, an einem Lager
 * begruendet sie das Material selbst.
 *
 * ⚠️ DIE PROBE STEHT HIER UND NICHT BEIM AUFRUFER, obwohl heute beide Aufrufer
 * (`templateSync`, `_actions/templates`) ohnehin nur Fahrzeuge erreichen. Genau
 * deshalb: ein kuenftiger dritter Aufrufer mit einer Lager-Id bekaeme sonst
 * klaglos die Box-Zeile geloescht — ein Datenverlust, den kein Tor sieht, weil
 * die Signatur eine beliebige `lagerortId` nimmt und immer genommen hat.
 */
export function bereinigeVerfallOhneAktivesSoll(
  db: DB | Tx,
  lagerortId: string,
  artikelId: string,
): void {
  const ort = db.select({ typ: lagerorte.typ })
    .from(lagerorte).where(eq(lagerorte.id, lagerortId)).get();
  if (ort?.typ !== "fahrzeug") return;

  const aktivePosition = db.select({ id: sollPositionen.id })
    .from(sollPositionen)
    .where(and(
      eq(sollPositionen.fahrzeugId, lagerortId),
      eq(sollPositionen.artikelId, artikelId),
      eq(sollPositionen.entfernt, false),
    ))
    .get();
  if (!aktivePosition) loescheVerfallEintrag(db, lagerortId, artikelId);
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
