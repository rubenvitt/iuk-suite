/**
 * Das Buchungsjournal. Kein "use client", kein Icon-Import.
 *
 * DREI AENDERUNGEN GEGENUEBER `queries.ts:86-123`, jede mit eigener Zusage:
 *
 * 1. BEIDE SUCHHAELFTEN FALTEN GLEICH (§5.13.2). Der Kommentar geht ueber die
 *    registrierte SQL-Funktion `lb_falte` (Teil 1, T12), der Artikelname in JS
 *    ueber `falte` — DIESELBE Funktion. Heute laufen sie auseinander, sobald der
 *    Begriff einen Nicht-ASCII-Buchstaben enthaelt: `PÄCKCHEN` findet den Artikel
 *    und VERLIERT jeden Kommentar, der `Päckchen` normal schreibt. Ohne
 *    Rueckmeldung — die Seite zeigt einfach weniger Zeilen.
 * 2. DER DECKEL WIRD BEOBACHTBAR (§5.14.3). Gelesen wird GRENZE + 1, geliefert
 *    GRENZE, und `mehrVorhanden` sagt, ob die Grenze WIRKLICH griff. Heute
 *    schreibt `journal/page.tsx:32` „Zeigt die neuesten 100 Treffer" UNBEDINGT.
 * 3. DIE SORTIERUNG BEKOMMT EINEN TIEBREAKER (§5.14.4): ORDER BY ts DESC, id DESC,
 *    Index `idx_buchungen_ts_id`.
 *    ⚠️ EHRLICH ZU SAGEN: `buchungen.id` ist ein `nanoid()` und NICHT zeitlich
 *    geordnet. Der Tiebreaker liefert eine TOTALE Ordnung, keine KAUSALE — er
 *    macht die Anzeige reproduzierbar, stellt aber nicht her, dass „Abgleich vor
 *    Nachfuellung" steht. Wer die tatsaechliche Reihenfolge braucht, liest die
 *    gemeinsame `referenz` (`check:<id>`) und die `typ`-Werte; deshalb steht
 *    `referenz` ab jetzt in der Zeile.
 *
 * DIE WHERE-BEDINGUNGEN GREIFEN VOR DEM LIMIT (`queries.ts:82-85`): die Suche geht
 * ueber die GESAMTE Historie und liefert davon die neuesten Treffer. Umgekehrt
 * durchsuchte sie nur die neuesten 100 Zeilen und faende bei wachsendem Journal
 * immer weniger.
 *
 * ⚠️ NIMMT `DB`, NICHT `Leser` (Festlegung H11): dieser Pfad ruft
 * `quelleAufloeser(db: DB)` und laeuft nie in einer Transaktion. Wer ihn dorthin
 * ziehen will, muss `quelleAufloeser` in Teil 1 anfassen — das ist eine
 * Entscheidung, kein Cast.
 */
import { and, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { artikel, buchungen } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { ortStamm } from "./orte";
import { falte } from "../suche";
import { JOURNAL_GRENZE } from "../grenzen";
import {
  AUSSONDERN_PRAEFIX,
  INVENTUR_PRAEFIX,
  istPraefixArt,
  praefixVon,
  type BuchungTyp,
  type Vorgangsart,
} from "../vorgang";
import type { DB } from "../../_db/client";

/**
 * DIE BEDINGUNG HINTER EINER VORGANGSART (DRK-344).
 *
 * Eine verfeinerte Art (`aussondern`, `inventur`) trifft ihr Praefix. Ein
 * BUCHUNGSTYP dagegen meint hier den Typ OHNE verfeinerndes Praefix — und das
 * ist eine Entscheidung, keine Nebenwirkung: gefiltert wird nach dem, was in
 * der Spalte STEHT. Wer „Korrektur" waehlt, bekommt genau die Zeilen, die als
 * „Korrektur" angezeigt werden; die Aussonderungen stehen unter
 * „Aussonderung". Waere es anders, zeigte die Tabelle unter einem Filter
 * Zeilen mit einer anderen Beschriftung als der gewaehlten.
 *
 * ⚠️ `referenz NOT LIKE '…'` IST FUER `referenz IS NULL` NICHT WAHR, SONDERN
 * NULL — und NULL ist in einem WHERE falsch. Ohne den ausgeschriebenen
 * `IS NULL`-Zweig verschwaende also ausgerechnet die haeufigste Zeile: die
 * freihaendige Korrektur ohne jede Referenz. Der Fehler waere still, die
 * Tabelle zeigte nur weniger.
 *
 * ⚠️ `LIKE` IST IN SQLITE FUER ASCII OHNE ACHT AUF GROSS- UND KLEINSCHREIBUNG.
 * Das geht hier gut, weil die Praefixe im Quelltext kleingeschrieben entstehen
 * (`_lib/vorgang.ts` ist ihre einzige Quelle) — ein `Aussondern:` kann gar
 * nicht in die Daten gelangen.
 */
function vorgangBedingung(art: Vorgangsart): SQL {
  if (istPraefixArt(art)) {
    return sql`${buchungen.referenz} LIKE ${`${praefixVon(art)}%`} ESCAPE '\\'`;
  }
  return and(
    eq(buchungen.typ, art),
    sql`(${buchungen.referenz} IS NULL OR (
      ${buchungen.referenz} NOT LIKE ${`${AUSSONDERN_PRAEFIX}%`} ESCAPE '\\'
      AND ${buchungen.referenz} NOT LIKE ${`${INVENTUR_PRAEFIX}%`} ESCAPE '\\'
    ))`,
  )!;
}

export type JournalFilter = {
  /** Freitext ueber Artikelname UND Kommentar. */
  q?: string;
  /**
   * DIE VORGANGSART, NICHT DER BUCHUNGSTYP (DRK-344). Neben den vier Typen
   * sind `aussondern` und `inventur` zulaessig; beide sind aus der `referenz`
   * abgeleitet und stehen NICHT im Spalten-Enum. Ein Buchungstyp meint hier
   * den Typ OHNE verfeinerndes Praefix — die Begruendung steht an
   * `vorgangBedingung`.
   *
   * ⚠️ IN DER ADRESSZEILE HEISST DIESER PARAMETER WEITER `typ`. Gespeicherte
   * Journal-Links tragen ihn, und ein Zeitraumbericht, der nach einer
   * Umbenennung ungefiltert auflaeuft, ist die stille Fehlaussage, gegen die
   * `zeitraumAus` gebaut ist. Uebersetzt wird in `journalParameterAus`.
   */
  vorgang?: Vorgangsart;
  /** inklusive untere Zeitgrenze */
  von?: Date;
  /** inklusive obere Zeitgrenze (der Aufrufer setzt das Tagesende, §5.14.2) */
  bis?: Date;
  /** Vorgabe `JOURNAL_GRENZE`. ⚠️ NICHT fuer die Artikel-Detail-Historie: die
   *  faehrt ihre eigene Abfrage in `lesepfade/artikel.ts` mit
   *  `ARTIKEL_VERLAUF_GRENZE` und ruft `journalEintraege` gar nicht. */
  grenze?: number;
  /**
   * DIE SCHLUESSELPOSITION, AB DER WEITERGELESEN WIRD (DRK-331).
   *
   * ⚠️ KEIN OFFSET. `LIMIT 100 OFFSET 400` liesse SQLite die ersten 400 Zeilen
   * erneut durchlaufen — die fuenfte Seite kostet dann fuenfmal so viel wie die
   * erste, und `better-sqlite3` ist SYNCHRON: die Suite steht waehrenddessen.
   * Ein Offset ist ausserdem NICHT STABIL: kommt waehrend des Blaetterns eine
   * Buchung dazu (und das ist hier der Normalfall, das Journal ist
   * append-only), rutscht die ganze Liste um eins und eine Zeile erscheint
   * doppelt oder gar nicht.
   *
   * Der Schluessel ist deshalb die Position selbst — `(ts, id)` der zuletzt
   * gelieferten Zeile. Er trifft den Index `idx_buchungen_ts_id` (§4.14) und
   * bleibt richtig, egal was inzwischen geschrieben wurde.
   */
  cursor?: { ts: Date; id: string };
};

export type JournalZeileRoh = {
  id: string;
  ts: Date;
  artikelName: string;
  typ: BuchungTyp;
  menge: number;
  quelleId: string;
  quelleName: string;
  kommentar: string | null;
  /** NEU in der Zeile: die einzige KAUSALE Klammer (`check:<id>`,
   *  `inventur:<id>`, `entnahme-ziel:<lagerortId>`, `umlagerung:<lagerortId>`)
   *  — der id-Tiebreaker ist es ausdruecklich nicht (§5.14.4). */
  referenz: string | null;
  /**
   * DRK-338 — DER ORT DIESER ZEILE, bereits aufgeloest.
   *
   * ⚠️ ER IST DER EINZIGE WEG, EINE UMLAGERUNG ZU LESEN. Sie schreibt zwei
   * Zeilen mit demselben Typ und entgegengesetztem Vorzeichen; welche die
   * QUELLE und welche das ZIEL ist, steht ausschliesslich in `lagerort_id`.
   * Ohne diese Spalte stand im Journal zweimal „Umlagerung" und einmal −5,
   * einmal +5 — und wohin das Material gewandert ist, war aus der Oberflaeche
   * ueberhaupt nicht zu erfahren.
   *
   * Aufgeloest wird HIER und nicht in der Anzeige: `lagerorte` ist winzig und
   * liegt ohnehin schon im Prozess (`ortStamm`), waehrend die Anzeige eine
   * zweite Quelle fuer Namen braeuchte — und zwar auf BEIDEN Wegen ueber die
   * Grenze (Server Component und Server Action).
   */
  ortName: string;
};

export type JournalErgebnis = {
  zeilen: JournalZeileRoh[];
  /**
   * Die Position hinter der letzten gelieferten Zeile — oder `null`, wenn es
   * nichts mehr zu holen gibt. Der naechste Abruf reicht sie als `cursor`
   * zurueck.
   */
  naechsterCursor: { ts: Date; id: string } | null;
  /** ⚠️ Der Beschreibungstext ist BEDINGT: bei `true` „Neueste 100 von mehr
   *  Treffern — Zeitraum eingrenzen", sonst „N Treffer" (§5.14.3, Auflage an
   *  Teil 5). Heute gibt es im Modul keinen Weg herauszufinden, ob eine Grenze
   *  zugeschlagen hat. */
  mehrVorhanden: boolean;
};

export function journalEintraege(db: DB, f: JournalFilter = {}): JournalErgebnis {
  const grenze = f.grenze ?? JOURNAL_GRENZE;
  const alleArtikel = db.select().from(artikel).all();
  const namen = new Map(alleArtikel.map((a) => [a.id, a.name]));
  // `lagerorte` ist eine Handvoll Zeilen — dieselbe Vollladung wie ueberall
  // (`_lib/lesepfade/orte.ts`), nicht ein Join je Buchungszeile.
  const orte = ortStamm(db);

  const conds: SQL[] = [];
  if (f.vorgang) conds.push(vorgangBedingung(f.vorgang));
  if (f.von) conds.push(gte(buchungen.ts, f.von));
  if (f.bis) conds.push(lte(buchungen.ts, f.bis));

  /**
   * Die Schluesselbedingung, und sie MUSS zur Sortierung passen: sortiert wird
   * `ts DESC, id DESC`, also ist „hinter dem Cursor" hier das KLEINERE Paar.
   * Ein `<=` auf `ts` allein liefe in eine Endlosschleife, sobald mehrere
   * Buchungen dieselbe Sekunde tragen — und genau das tun sie, ein
   * Check-Abschluss schreibt mehrere Zeilen in derselben Sekunde (§5.14.4).
   */
  if (f.cursor) {
    conds.push(or(
      lt(buchungen.ts, f.cursor.ts),
      and(eq(buchungen.ts, f.cursor.ts), lt(buchungen.id, f.cursor.id)),
    )!);
  }

  const term = f.q?.trim();
  if (term) {
    // BEIDE HAELFTEN UEBER DIESELBE `falte` (§5.13.2).
    const norm = falte(term);
    // LIKE-Sonderzeichen NACH dem Falten woertlich machen (`queries.ts:99`):
    // ohne das matcht „5%" jeden Kommentar mit einer 5.
    const escaped = norm.replace(/[\\%_]/g, (c) => `\\${c}`);
    const textConds: SQL[] = [
      sql`lb_falte(${buchungen.kommentar}) LIKE ${`%${escaped}%`} ESCAPE '\\'`,
    ];
    const treffer = alleArtikel.filter((a) => falte(a.name).includes(norm)).map((a) => a.id);
    if (treffer.length > 0) textConds.push(inArray(buchungen.artikelId, treffer));
    conds.push(or(...textConds)!);
  }

  // GRENZE + 1 lesen, GRENZE liefern — so ist „hat die Grenze gegriffen?"
  // beantwortbar, ohne eine zweite `count(*)`-Abfrage zu fahren.
  const rows = db
    .select()
    .from(buchungen)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(buchungen.ts), desc(buchungen.id))
    .limit(grenze + 1)
    .all();

  const mehrVorhanden = rows.length > grenze;
  const geliefert = rows.slice(0, grenze);
  const letzte = geliefert.at(-1);
  const wer = quelleAufloeser(db);
  return {
    mehrVorhanden,
    // Nur wenn es WIRKLICH weitergeht. Ein Cursor auf der letzten Seite liesse
    // den Aufrufer noch einen leeren Abruf fahren.
    naechsterCursor: mehrVorhanden && letzte ? { ts: letzte.ts, id: letzte.id } : null,
    zeilen: geliefert.map((b) => ({
      id: b.id,
      ts: b.ts,
      artikelName: namen.get(b.artikelId) ?? "–",
      typ: b.typ,
      menge: b.menge,
      quelleId: b.quelleId,
      quelleName: wer(b.quelleTyp, b.quelleId),
      kommentar: b.kommentar,
      referenz: b.referenz,
      // Ein geloeschter Ort faellt auf seine Kennung zurueck statt auf „–":
      // das Journal ist append-only, die Zeile bleibt lesbar.
      ortName: orte.get(b.lagerortId)?.name ?? b.lagerortId,
    })),
  };
}
