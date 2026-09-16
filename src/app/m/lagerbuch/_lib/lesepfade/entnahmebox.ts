/**
 * DIE ENTNAHMEBOX ALS LESEPFAD — DRK-314.
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7): gelesen wird von zwei
 * Server Components (Helferschirm und Verwaltungsseite) und von der Action, die
 * ihre Fehlermeldung mit dem Artikelnamen fuellt.
 *
 * ── WAS HIER NICHT STEHT UND WARUM ────────────────────────────────────────
 *
 * ⚠️ ES GIBT KEINE FUNKTION „Bestand im Handlager PLUS Box". Die Box ist ein
 * ZWISCHENZUSTAND, kein zweites Lager: was darin liegt, ist noch nicht
 * eingeraeumt, seine Menge ist noch nicht gezaehlt und sein Platz im Schrank
 * noch nicht entschieden. Eine Summe ueber beide Orte waere in jedem Fall
 * falsch, in dem sie gebraucht wuerde — der Bestellvorschlag schluege nicht an,
 * obwohl im Schrank nichts liegt, und die Entnahme am Regal boete Material an,
 * das niemand dort findet.
 *
 * ⚠️ UND ES GIBT KEINEN SCHREIBWEG AUS DER BOX HERAUS. Das Einsortieren ins
 * Handlager ist [DRK-313] und ausdruecklich NICHT Teil dieses Tickets. Die
 * Naht dafuer ist `boxInhalt()`: sie liefert bereits, was eine Auffuellansicht
 * braucht (Artikel, Menge, Chargen mit Verfall), und ein zweiter Lesepfad
 * daneben waere die zweite Wahrheit ueber denselben Ort.
 */
import { and, desc, eq, gt, like, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { quelleAufloeser } from "../../_db/quelle";
import { artikel, buchungen, lagerorte } from "../../_db/schema";
import { verfallSchwellen, verfallStatus, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { ENTNAHMEBOX_ID, standortZeile } from "../konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "../vorgang";
import { chargenJeArtikelAmLagerort, type ChargeZeile } from "./artikel";
import { bestandJeArtikel, type Leser } from "./bestand";
import { ortStamm } from "./orte";

/**
 * Eine Charge, wie sie BEIDE Flaechen zeigen — die Chargenzeile plus ihre
 * Ampel.
 *
 * ⚠️ DIE AMPEL WIRD SERVERSEITIG GERECHNET, nicht in der Insel. `verfallStatus`
 * liest die Schwellen aus der Umgebung und rechnet zonenexplizit; eine Insel,
 * die das nachbaut, rechnet in der Zone des Geraets — auf einem privaten
 * Telefon im Urlaub steht die Ampel dann auf einem anderen Tag als die
 * Verwaltungsseite daneben. Dieselbe Festlegung wie im Check (§7.9.3).
 *
 * ⚠️ `text` KOMMT AUS `chargeText` UND WIRD NICHT NEU FORMULIERT. Vier Zustaende
 * („abgelaufen", „läuft MM/JJ ab", „fällig MM/JJ", „bis MM/JJ"), und sie sind
 * Vertrag, nicht Dekoration (`_lib/format.ts`): dieselben Worte stehen an der
 * Charge im Artikeldetail und im Entnahmeschirm. Zwei Schreibweisen fuer
 * denselben Zustand lassen den Leser einen dritten vermuten.
 */
export type BoxCharge = ChargeZeile & { ampel: Ampel; text: string };

/**
 * Ein Posten — EIN Artikel an EINEM Ort, mit seinen Chargen.
 *
 * ⚠️ AUSSCHLIESSLICH JSON-SICHERE SKALARE. Beide Verwender sind Client-Inseln;
 * ein `Date` ueberquert die RSC-Grenze klaglos und formatiert danach in der Zone
 * des Geraets (Falle aus DRK-306), eine Funktion ueberquert sie gar nicht
 * (Falle 9).
 */
export type BoxPosten = {
  artikelId: string;
  artikelName: string;
  einheit: string;
  /** Summe ueber alle Chargen des Artikels AN DIESEM ORT. Immer > 0. */
  menge: number;
  /** FEFO-sortiert, nur Chargen mit Rest > 0 (`chargenJeArtikelAmLagerort`). */
  chargen: BoxCharge[];
};

/**
 * Die Zeile der Box selbst — `null`, wenn es sie nicht gibt.
 *
 * ⚠️ `null` IST EIN ECHTER ZUSTAND UND KEIN VERSEHEN, auch wenn Migration 0011
 * die Zeile schreibt: eine importierte Alt-Datenbank kann sie unter einem
 * anderen Namen fuehren, und jemand kann sie geloescht haben. Beide Flaechen
 * sagen dann, dass die Box fehlt, statt mit einer leeren Liste zu behaupten,
 * sie sei leer — der Unterschied ist genau der zwischen „nichts drin" und „gibt
 * es nicht".
 */
export function boxOrt(db: Leser): { id: string; name: string; aktiv: boolean } | null {
  const zeile = db.select({ id: lagerorte.id, name: lagerorte.name, typ: lagerorte.typ, aktiv: lagerorte.aktiv })
    .from(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get();
  // `typ` wird MITGEPRUEFT: eine Zeile mit dieser Id, die kein Lager ist, ist
  // nicht die Box, sondern eine Namenskollision — und eine Buchung dagegen
  // liefe still in einen fremden Ort.
  if (!zeile || zeile.typ !== "lager") return null;
  return { id: zeile.id, name: zeile.name, aktiv: zeile.aktiv };
}

/**
 * Was an EINEM Ort liegt, nach Artikelnamen sortiert.
 *
 * ⚠️ DREI ABFRAGEN, NICHT DREI JE ARTIKEL: Bestand je Artikel am Ort, Chargen
 * je Artikel am Ort, Artikelstammdaten. Dieselbe Form und dieselbe Begruendung
 * wie im Fahrzeugblatt (`chargenJeArtikelAmLagerort`, §5.2.3) —
 * `better-sqlite3` ist SYNCHRON, eine Schleife mit einer Abfrage je Artikel
 * blockiert die GANZE Suite, nicht nur dieses Modul.
 *
 * ⚠️ NUR POSTEN MIT MENGE > 0. Ein Artikel, dessen Bestand hier auf null
 * gebucht wurde, ist kein Posten — er stuende sonst als „0 Stk." in der Box und
 * saehe aus wie etwas, das jemand einsortieren muss.
 */
export function postenAmOrt(db: Leser, lagerortId: string, jetzt: Date = new Date()): BoxPosten[] {
  const mengen = bestandJeArtikel(db, [lagerortId]);
  const chargen = chargenJeArtikelAmLagerort(db, lagerortId);
  const schwellen = verfallSchwellen();

  const posten: BoxPosten[] = [];
  for (const a of db.select().from(artikel).all()) {
    const menge = mengen.get(a.id) ?? 0;
    if (menge <= 0) continue;
    /*
     * ⚠️ `artikel.aktiv` WIRD NICHT GEFILTERT, und das ist der Unterschied zur
     * Artikelliste. Ein stillgelegter Artikel, der noch irgendwo liegt, ist
     * genau der, den jemand aus der Kiste nehmen und entsorgen muss. Ihn
     * auszublenden hiesse: Material, das physisch da ist, verschwindet aus der
     * einzigen Ansicht, die es zeigt.
     */
    posten.push({
      artikelId: a.id,
      artikelName: a.name,
      einheit: a.einheit,
      menge,
      chargen: (chargen.get(a.id) ?? []).map((c) => {
        const s = verfallStatus(c.verfall, schwellen, jetzt);
        return { ...c, ampel: s.ampel, text: chargeText(s, c.verfall) };
      }),
    });
  }
  return posten.sort((x, y) => x.artikelName.localeCompare(y.artikelName, "de"));
}

/**
 * Was in der Box liegt. Leere Liste heisst „die Box ist leer" — dass es sie
 * ueberhaupt gibt, beantwortet `boxOrt`.
 */
export function boxInhalt(db: Leser, jetzt: Date = new Date()): BoxPosten[] {
  return postenAmOrt(db, ENTNAHMEBOX_ID, jetzt);
}

/**
 * Ein Zugang in die Box, wie ihn die Verwaltungsseite unter dem Inhalt zeigt.
 *
 * ⚠️ `ts` BLEIBT EIN `Date` UND WIRD HIER NICHT FORMATIERT. Zonenexplizit
 * formatiert die SEITE (`fmtDatumZeit`, `_lib/zeit.ts`), bevor sie den Wert an
 * eine Insel reicht — ein `Date` ueberquert die RSC-Grenze klaglos und
 * formatiert danach in der Zone des GERAETS, ohne dass ein Tor etwas meldet
 * (dieselbe Zusage wie in `verwaltung/fahrzeuge` seit DRK-298).
 */
export type BoxZugang = {
  buchungId: string;
  ts: Date;
  artikelName: string;
  menge: number;
  einheit: string;
  /**
   * Die Einheit, aus der das Material kam — als Zeile, die sie BENENNT
   * (`standortZeile`: „RTW 1 · Fahrzeug"). `null` heisst „nicht mehr
   * auflösbar".
   *
   * ⚠️ `null` IST EIN ECHTER ZUSTAND: die Referenz traegt eine ID ohne
   * Fremdschluessel, und eine geloeschte Einheit hinterlaesst sie als Waise. Das
   * ist der Preis dafuer, dass die Herkunft im append-only-Journal steht und
   * nicht in einer Spalte, die jemand pflegt — und er ist der richtige: ein
   * geratener Name waere eine Behauptung ueber einen Vorgang.
   */
  herkunft: string | null;
  /** Kärtchen-Label oder Klarname — nie die rohe Kennung, wenn es anders geht. */
  wer: string;
};

/**
 * Die juengsten Zugaenge in die Box — EIN VORGANG, EINE ZEILE, neueste zuerst.
 *
 * ⚠️ NUR DIE ZEILEN MIT POSITIVER MENGE. Eine Umlagerung schreibt ZWEI Legs mit
 * derselben Referenz (`_lib/schreibpfade/umlagerung.ts`); ohne diese Bedingung
 * stuende jeder Vorgang zweimal da — einmal als Abgang aus der Einheit, einmal
 * als Zugang in die Box. Der Ortsfilter allein reicht dafuer NICHT, er trennt
 * die Legs zwar, aber die Bedingung ist die, die den Gedanken traegt.
 *
 * ── WARUM GRUPPIERT WIRD (Codex-Review zu PR #175) ────────────────────────
 *
 * ⚠️ EIN HANDGRIFF SIND MEHRERE ZEILEN. `umlagerung` bucht JE CHARGE ein
 * Legpaar — eine FEFO-Abgabe ueber drei Chargen erzeugt drei positive Zeilen in
 * der Box. Ungruppiert stuende derselbe Handgriff dreimal untereinander und
 * fraesse drei Plaetze der Grenze: die Liste behauptete mehr Abgaben, als es
 * gab, und zeigte weniger weit zurueck, als sie verspricht. Und die Grenze
 * traegt ihre Zusage nur, wenn sie VORGAENGE zaehlt — deshalb gruppiert die
 * ABFRAGE, nicht der JS-Code danach: ein `limit` vor der Faltung schnitte
 * mitten in einen Vorgang.
 *
 * ⚠️ DER SCHLUESSEL IST (Referenz, Zeitpunkt, Artikel) UND NICHT DIE REFERENZ
 * ALLEIN. Die Referenz lautet `entnahmebox:<fahrzeugId>` und ist damit fuer
 * JEDE Abgabe aus derselben Einheit dieselbe — nach ihr allein zu gruppieren
 * faltete die gesamte Geschichte einer Einheit zu einer Zeile zusammen, also
 * genau der Gegenfehler. Der Artikel gehoert dazu, weil die Referenz ihn nicht
 * nennt; zwei Artikel in einer Mengenangabe waeren eine Auskunft, die es nicht
 * gibt.
 *
 * ⚠️ DER ZEITPUNKT TRAEGT DIE ABGRENZUNG, WEIL EINE TRANSAKTION IHRE LEGS IN
 * DERSELBEN SEKUNDE SCHREIBT — dieselbe Sekundengranularitaet, die
 * `_db/schema.ts` am Check ausdruecklich als fachlich sichtbar beschreibt. Der
 * Preis ist benannt und hinnehmbar: zwei Abgaben desselben Artikels aus
 * derselben Einheit in derselben Sekunde stehen als eine Zeile. Das ist
 * dieselbe Sekunde, dieselbe Quelle, dieselbe Einheit, derselbe Artikel — als
 * getrennte Handgriffe waeren sie fuer einen Leser ohnehin nicht zu
 * unterscheiden.
 *
 * ⚠️ DIE HERKUNFT KOMMT AUS DER REFERENZ, NICHT AUS DER GEGENZEILE. Beide Wege
 * sind moeglich; dieser ist eine Abfrage statt zweier und bleibt richtig, wenn
 * eine Umlagerung ueber mehrere Chargen laeuft.
 *
 * ⚠️ `ORDER BY ts DESC, id DESC` — die Sekunde allein ist keine totale Ordnung
 * (`_db/schema.ts`: `buchungen.id` ist der Tiebreaker jeder deterministischen
 * Sortierung). Gruppiert ist `id` das MAXIMUM der Gruppe: es ist zugleich der
 * Schluessel der Zeile, und ein beliebig gewaehltes Mitglied waere von Lauf zu
 * Lauf ein anderes.
 *
 * ⚠️ `quelle_typ` UND `quelle_id` KOMMEN UEBER `min()` HERAUS, NICHT ALS NACKTE
 * SPALTEN. Innerhalb einer Gruppe sind sie konstant — dieselbe Transaktion,
 * dieselbe Quelle —, aber SQLite erlaubt nackte Spalten in einer
 * Aggregatabfrage und waehlt dann eine BELIEBIGE Zeile aus. Was heute richtig
 * herauskaeme, waere eine Eigenschaft der Daten und keine der Abfrage.
 */
export function letzteBoxZugaenge(db: DB, grenze = 25): BoxZugang[] {
  const orte = ortStamm(db);
  const wer = quelleAufloeser(db);
  const namen = new Map(db.select({ id: artikel.id, name: artikel.name, einheit: artikel.einheit })
    .from(artikel).all().map((a) => [a.id, a] as const));

  return db
    .select({
      buchungId: sql<string>`max(${buchungen.id})`,
      ts: buchungen.ts,
      artikelId: buchungen.artikelId,
      referenz: buchungen.referenz,
      menge: sql<number>`sum(${buchungen.menge})`,
      quelleTyp: sql<string>`min(${buchungen.quelleTyp})`,
      quelleId: sql<string>`min(${buchungen.quelleId})`,
    })
    .from(buchungen)
    .where(and(
      eq(buchungen.lagerortId, ENTNAHMEBOX_ID),
      like(buchungen.referenz, `${ENTNAHMEBOX_PRAEFIX}%`),
      gt(buchungen.menge, 0),
    ))
    .groupBy(buchungen.referenz, buchungen.ts, buchungen.artikelId)
    .orderBy(desc(buchungen.ts), desc(sql`max(${buchungen.id})`))
    .limit(grenze)
    .all()
    .map((b) => {
      const quelle = orte.get((b.referenz ?? "").slice(ENTNAHMEBOX_PRAEFIX.length));
      const a = namen.get(b.artikelId);
      return {
        buchungId: b.buchungId,
        ts: b.ts,
        artikelName: a?.name ?? b.artikelId,
        menge: b.menge,
        einheit: a?.einheit ?? "",
        herkunft: quelle ? standortZeile(quelle) : null,
        wer: wer(b.quelleTyp, b.quelleId),
      };
    });
}
