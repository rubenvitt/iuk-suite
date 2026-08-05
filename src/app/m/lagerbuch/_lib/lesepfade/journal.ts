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
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { artikel, buchungen } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { falte } from "../suche";
import { JOURNAL_GRENZE } from "../grenzen";
import type { DB } from "../../_db/client";

export type BuchungTyp = "zugang" | "entnahme" | "korrektur" | "umlagerung";

export type JournalFilter = {
  /** Freitext ueber Artikelname UND Kommentar. */
  q?: string;
  typ?: BuchungTyp;
  /** inklusive untere Zeitgrenze */
  von?: Date;
  /** inklusive obere Zeitgrenze (der Aufrufer setzt das Tagesende, §5.14.2) */
  bis?: Date;
  /** Vorgabe `JOURNAL_GRENZE`. Kein Produktionsaufrufer setzt sie; sie existiert
   *  allein fuer Tests. ⚠️ NICHT fuer die Artikel-Detail-Historie: die faehrt
   *  ihre eigene Abfrage in `lesepfade/artikel.ts` mit
   *  `ARTIKEL_VERLAUF_GRENZE` und ruft `journalEintraege` gar nicht. */
  grenze?: number;
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
   *  `inventur:<id>`, `entnahme-ziel:<lagerortId>`) — der id-Tiebreaker ist es
   *  ausdruecklich nicht (§5.14.4). */
  referenz: string | null;
};

export type JournalErgebnis = {
  zeilen: JournalZeileRoh[];
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

  const conds: SQL[] = [];
  if (f.typ) conds.push(eq(buchungen.typ, f.typ));
  if (f.von) conds.push(gte(buchungen.ts, f.von));
  if (f.bis) conds.push(lte(buchungen.ts, f.bis));

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
  const wer = quelleAufloeser(db);
  return {
    mehrVorhanden,
    zeilen: rows.slice(0, grenze).map((b) => ({
      id: b.id,
      ts: b.ts,
      artikelName: namen.get(b.artikelId) ?? "–",
      typ: b.typ,
      menge: b.menge,
      quelleId: b.quelleId,
      quelleName: wer(b.quelleTyp, b.quelleId),
      kommentar: b.kommentar,
      referenz: b.referenz,
    })),
  };
}
